import type { Db } from "../db/client";
import { notifications, processedWebhooks } from "../db/schema";
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
 * Process one inbound webhook (already signature-verified and JSON-parsed),
 * atomically:
 *   1. Record the idempotency key — a conflict means this is a retry → `duplicate`.
 *   2. MVP scope: only `proposal_created` becomes a notification; every other
 *      event type is recorded as processed and `ignored` (so it is not retried).
 *   3. Classify by the proposal's actions and persist the notification.
 *
 * In-app delivery is satisfied by the persisted row (the feed/badge read it).
 * Email/push fan-out is layered on in a later phase.
 */
export async function ingestWebhook(db: Db, event: BaseEvent): Promise<IngestResult> {
	const idempotencyKey = event.idempotency_key;
	if (!idempotencyKey) {
		throw new MissingIdempotencyKeyError();
	}

	return db.transaction(async (tx) => {
		const claimed = await tx
			.insert(processedWebhooks)
			.values({ idempotencyKey })
			.onConflictDoNothing()
			.returning({ idempotencyKey: processedWebhooks.idempotencyKey });

		if (claimed.length === 0) {
			return "duplicate";
		}

		if (!isProposalCreated(event)) {
			return "ignored";
		}

		if (!event.user_space_id) {
			// proposal_created is always addressed to an editor; without a
			// recipient there is nothing to deliver. Treated as ignored (acked).
			return "ignored";
		}

		await tx
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
			.onConflictDoNothing();

		return "stored";
	});
}
