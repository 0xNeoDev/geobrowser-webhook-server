import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema";
import { deliverOutbound, type EmailDeps } from "../../src/delivery/deliver";
import { claimPendingEmails, type NotificationRow, recordEmailOutcome } from "../../src/repo/notifications";
import { upsertUser } from "../../src/repo/users";
import { RUN, resetDb, SPACE_ID, USER_SPACE_ID } from "./db";

/** A pending notification (email_status defaults to 'pending'). */
async function seedPending(idempotencyKey: string): Promise<NotificationRow> {
	const [row] = await db
		.insert(notifications)
		.values({
			userSpaceId: USER_SPACE_ID,
			eventType: "proposal_created",
			notificationType: "new_proposal",
			spaceId: SPACE_ID,
			payload: {},
			idempotencyKey,
		})
		.returning();
	return row;
}

function okDeps(): EmailDeps & { sent: string[] } {
	const sent: string[] = [];
	return {
		sent,
		channelStatus: () => "ok",
		send: async (input) => {
			sent.push(input.to);
		},
		maxPerRecipientPerHour: 0,
		staleThresholdSeconds: 0,
		maxAttempts: 6,
	};
}

async function rowOf(id: string): Promise<NotificationRow> {
	const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
	return row;
}

describe.skipIf(!RUN)("email outbox — claim + worker per-row path", () => {
	beforeEach(resetDb);

	it("claims due pending rows and leases them (next_retry pushed into the future)", async () => {
		const n = await seedPending("o1");
		const claimed = await claimPendingEmails(db, 10, 120);
		expect(claimed.map((r) => r.id)).toContain(n.id);
		const row = await rowOf(n.id);
		expect(row.emailStatus).toBe("pending");
		expect(row.emailNextRetryAt).not.toBeNull(); // leased
	});

	it("does not re-claim a row whose lease is still in the future", async () => {
		const n = await seedPending("o2");
		await claimPendingEmails(db, 10, 120); // leases it ~120s out
		const again = await claimPendingEmails(db, 10, 120);
		expect(again.map((r) => r.id)).not.toContain(n.id);
	});

	it("does not claim terminal (non-pending) rows", async () => {
		const n = await seedPending("o3");
		await recordEmailOutcome(db, n.id, "sent");
		const claimed = await claimPendingEmails(db, 10, 120);
		expect(claimed.map((r) => r.id)).not.toContain(n.id);
	});

	it("claim → deliver marks the row sent (the worker's per-row path)", async () => {
		await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: "a@b.com" });
		await seedPending("o4");

		const [claimed] = await claimPendingEmails(db, 10, 120);
		const deps = okDeps();
		await deliverOutbound(db, claimed, deps);

		expect(deps.sent).toEqual(["a@b.com"]);
		const row = await rowOf(claimed.id);
		expect(row.emailStatus).toBe("sent");
		expect(row.emailSentAt).not.toBeNull();
	});
});
