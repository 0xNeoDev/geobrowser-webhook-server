import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema";
import { deliverOutbound, type EmailDeps } from "../../src/delivery/deliver";
import type { NotificationRow } from "../../src/repo/notifications";
import { upsertPreferences } from "../../src/repo/preferences";
import { upsertUser } from "../../src/repo/users";
import { RUN, resetDb, SPACE_ID, USER_SPACE_ID } from "./db";

async function seedNotification(
	idempotencyKey: string,
	emailSentAt?: Date,
	eventTimestampSeconds?: number,
): Promise<NotificationRow> {
	const [row] = await db
		.insert(notifications)
		.values({
			userSpaceId: USER_SPACE_ID,
			eventType: "proposal_created",
			notificationType: "new_proposal",
			spaceId: SPACE_ID,
			payload: eventTimestampSeconds === undefined ? {} : { timestamp: eventTimestampSeconds },
			idempotencyKey,
			emailSentAt,
		})
		.returning();
	return row;
}

/** A deps object whose `send` records every call, with configurable cap + stale gate. */
function recordingDeps(
	maxPerRecipientPerHour = 0,
	staleThresholdSeconds = 0,
): EmailDeps & { sent: Array<{ to: string }> } {
	const sent: Array<{ to: string }> = [];
	return {
		sent,
		isConfigured: () => true,
		send: async (input) => {
			sent.push({ to: input.to });
		},
		maxPerRecipientPerHour,
		staleThresholdSeconds,
	};
}

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

describe.skipIf(!RUN)("deliverOutbound — email (integration)", () => {
	beforeEach(resetDb);

	it("sends and stamps email_sent_at when enabled, configured, and the recipient has an email", async () => {
		await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: "a@b.com" });
		const n = await seedNotification("d1");
		const deps = recordingDeps();

		await deliverOutbound(db, n, deps);

		expect(deps.sent).toEqual([{ to: "a@b.com" }]);
		const [row] = await db.select().from(notifications).where(eq(notifications.id, n.id));
		expect(row.emailSentAt).not.toBeNull();
	});

	it("skips when the email channel is disabled", async () => {
		await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: "a@b.com" });
		await upsertPreferences(db, USER_SPACE_ID, { emailEnabled: false });
		const deps = recordingDeps();

		await deliverOutbound(db, await seedNotification("d2"), deps);

		expect(deps.sent).toHaveLength(0);
	});

	it("skips when the recipient has no email", async () => {
		await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: null });
		const deps = recordingDeps();

		await deliverOutbound(db, await seedNotification("d3"), deps);

		expect(deps.sent).toHaveLength(0);
	});

	it("respects the per-recipient hourly cap", async () => {
		await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: "a@b.com" });
		// One email already sent within the last hour.
		await seedNotification("recent", new Date());
		const deps = recordingDeps(1);

		await deliverOutbound(db, await seedNotification("d4"), deps);

		expect(deps.sent).toHaveLength(0);
	});

	describe("staleness gate (STALE_THRESHOLD_DAYS)", () => {
		beforeEach(async () => {
			await upsertUser(db, { privyUserId: "did:1", userSpaceId: USER_SPACE_ID, email: "a@b.com" });
		});

		it("skips email when the event is older than the threshold", async () => {
			const n = await seedNotification("stale", undefined, nowSec() - 6 * DAY);
			const deps = recordingDeps(0, 5 * DAY);
			await deliverOutbound(db, n, deps);
			expect(deps.sent).toHaveLength(0);
		});

		it("sends when the event is within the threshold", async () => {
			const n = await seedNotification("fresh", undefined, nowSec() - 1 * DAY);
			const deps = recordingDeps(0, 5 * DAY);
			await deliverOutbound(db, n, deps);
			expect(deps.sent).toHaveLength(1);
		});

		it("does not gate when the threshold is 0 (off), even for very old events", async () => {
			const n = await seedNotification("old-but-no-gate", undefined, nowSec() - 100 * DAY);
			const deps = recordingDeps(0, 0);
			await deliverOutbound(db, n, deps);
			expect(deps.sent).toHaveLength(1);
		});

		it("fails open: sends when the event has no timestamp, even with a threshold set", async () => {
			const n = await seedNotification("no-timestamp", undefined, undefined);
			const deps = recordingDeps(0, 5 * DAY);
			await deliverOutbound(db, n, deps);
			expect(deps.sent).toHaveLength(1);
		});
	});
});
