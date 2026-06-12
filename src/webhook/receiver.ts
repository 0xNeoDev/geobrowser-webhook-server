import type { Db } from "../db/client";
import { notifications, processedWebhooks } from "../db/schema";
import { deliverOutbound } from "../delivery/deliver";
import { classifyProposal } from "./classify";
import { type BaseEvent, isProposalCreated } from "./types";

export type IngestResult = "stored" | "ignored" | "duplicate";

export class MissingIdempotencyKeyError extends Error {
	constructor() {
		super("missing idempotency_key");
		this.name = "MissingIdempotencyKeyError";
	}
}

/**
 * Process one inbound webhook (already signature-verified and JSON-parsed):
 *   1. Record the idempotency key — a conflict means a retry → `duplicate`.
 *   2. MVP scope: only `proposal_created` becomes a notification; every other
 *      event type is recorded as processed and `ignored` (so it is not retried).
 *   3. Classify by the proposal's actions and persist (in-app delivery).
 *   4. After commit, fan out to outbound channels (email) — best-effort.
 */
export async function ingestWebhook(db: Db, event: BaseEvent): Promise<IngestResult> {
	const idempotencyKey = event.idempotency_key;
	if (!idempotencyKey) {
		throw new MissingIdempotencyKeyError();
	}

	const outcome = await db.transaction(async (tx) => {
		const claimed = await tx
			.insert(processedWebhooks)
			.values({ idempotencyKey })
			.onConflictDoNothing()
			.returning({ idempotencyKey: processedWebhooks.idempotencyKey });

		if (claimed.length === 0) {
			return { status: "duplicate" as const };
		}

		// proposal_created always carries a recipient (an editor); without one
		// there's nothing to deliver. Both non-MVP types and recipient-less
		// events are acked-and-ignored.
		if (!isProposalCreated(event) || !event.user_space_id) {
			return { status: "ignored" as const };
		}

		const [row] = await tx
			.insert(notifications)
			.values({
				userSpaceId: event.user_space_id,
				eventType: "proposal_created",
				notificationType: classifyProposal(event.actions),
				spaceId: event.space_id,
				spaceName: event.space_name ?? null,
				proposalId: event.proposal_id ?? null,
				proposalName: event.proposal_name ?? null,
				proposerId: event.proposer_id ?? null,
				proposerName: event.proposer_name ?? null,
				payload: event,
				idempotencyKey,
			})
			.onConflictDoNothing()
			.returning();

		return { status: "stored" as const, notification: row };
	});

	// Outbound fan-out happens after the transaction commits, so a slow/failed
	// email never holds a DB transaction open or rolls back the stored row.
	if (outcome.status === "stored" && outcome.notification) {
		await deliverOutbound(db, outcome.notification);
	}

	return outcome.status;
}
