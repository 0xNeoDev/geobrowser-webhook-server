import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema";
import { ingestWebhook } from "../../src/webhook/receiver";
import type { BaseEvent } from "../../src/webhook/types";
import { PROPOSAL_ID, RUN, resetDb, SPACE_ID, USER_SPACE_ID } from "./db";

function proposalCreated(overrides: Record<string, unknown> = {}): BaseEvent {
	return {
		version: 1,
		event_type: "proposal_created",
		category: "governance",
		space_id: SPACE_ID,
		space_name: "Geo Genesis",
		user_space_id: USER_SPACE_ID,
		idempotency_key: "k1",
		proposal_id: PROPOSAL_ID,
		proposal_name: "Add Bob as editor",
		actions: [{ type: "add_editor", target_address: "0x1" }],
		...overrides,
	} as unknown as BaseEvent;
}

describe.skipIf(!RUN)("ingestWebhook (integration)", () => {
	beforeEach(resetDb);

	it("persists a proposal_created with add_editor as editorship_request", async () => {
		expect(await ingestWebhook(db, proposalCreated())).toBe("stored");
		const rows = await db.select().from(notifications).where(eq(notifications.userSpaceId, USER_SPACE_ID));
		expect(rows).toHaveLength(1);
		expect(rows[0].notificationType).toBe("editorship_request");
		expect(rows[0].spaceName).toBe("Geo Genesis");
	});

	it("dedupes a repeated idempotency_key", async () => {
		expect(await ingestWebhook(db, proposalCreated())).toBe("stored");
		expect(await ingestWebhook(db, proposalCreated())).toBe("duplicate");
		expect(await db.select().from(notifications)).toHaveLength(1);
	});

	it("acks-and-ignores non-proposal_created events but records the key", async () => {
		const voted = {
			event_type: "proposal_voted",
			space_id: SPACE_ID,
			user_space_id: USER_SPACE_ID,
			idempotency_key: "v1",
		} as unknown as BaseEvent;
		expect(await ingestWebhook(db, voted)).toBe("ignored");
		// Unsupported types are dropped with zero writes.
		expect(await db.select().from(notifications)).toHaveLength(0);
	});

	it("ignores a proposal_created without a recipient", async () => {
		expect(await ingestWebhook(db, proposalCreated({ user_space_id: undefined, idempotency_key: "k2" }))).toBe(
			"ignored",
		);
		expect(await db.select().from(notifications)).toHaveLength(0);
	});

	it("classifies add_member as membership_request and everything else as new_proposal", async () => {
		await ingestWebhook(db, proposalCreated({ idempotency_key: "m", actions: [{ type: "add_member" }] }));
		await ingestWebhook(db, proposalCreated({ idempotency_key: "p", actions: [{ type: "publish" }] }));
		const types = (await db.select().from(notifications)).map((r) => r.notificationType).sort();
		expect(types).toEqual(["membership_request", "new_proposal"]);
	});
});
