import type { Db } from "../db/client";
import { notifications } from "../db/schema";
import { classifyProposal } from "./classify";
import { type BaseEvent, isProposalCreated, isSupportedEventType } from "./types";

export type IngestResult = "stored" | "ignored" | "duplicate";

export class MissingIdempotencyKeyError extends Error {
	constructor() {
		super("missing idempotency_key");
		this.name = "MissingIdempotencyKeyError";
	}
}

/**
 * Process one inbound webhook (already signature-verified and JSON-parsed):
 *   - Unsupported event types (see SUPPORTED_EVENT_TYPES) are acked and
 *     **dropped with no DB write** — re-delivery is harmless (we do nothing).
 *   - `proposal_created` is classified by its actions and persisted. Dedup is
 *     enforced by the unique `notifications.idempotency_key`, which also covers
 *     delivery-worker retries — a conflict means `duplicate`.
 *   - After a successful insert, fan out to outbound channels (email),
 *     best-effort.
 */
export async function ingestWebhook(db: Db, event: BaseEvent): Promise<IngestResult> {
	if (!event.idempotency_key) {
		throw new MissingIdempotencyKeyError();
	}

	// Only act on the types we support; everything else is acked + dropped.
	if (!isSupportedEventType(event.event_type)) {
		return "ignored";
	}
	// The only supported type today is proposal_created; it must carry a recipient.
	if (!isProposalCreated(event) || !event.user_space_id) {
		return "ignored";
	}

	const [row] = await db
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
			idempotencyKey: event.idempotency_key,
		})
		.onConflictDoNothing()
		.returning();

	if (!row) {
		return "duplicate"; // same idempotency_key already stored (e.g. a retry)
	}

	// Email is delivered asynchronously: the row is persisted `email_status='pending'`
	// (schema default) and the email outbox worker picks it up. The webhook acks as
	// soon as the durable in-app delivery (this row) is committed.
	return "stored";
}
