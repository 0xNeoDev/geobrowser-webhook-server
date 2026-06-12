// Inbound Geo webhook payload types.
// Source of truth: gaia `notification-service/WEBHOOK_INTEGRATION.md`.
//
// For the MVP we only act on `proposal_created`; other event types are
// acknowledged and ignored. We type only what we consume, plus a permissive
// base so unknown events still parse.

/** A single proposal action. In the JSON payload the discriminator is `type`. */
export interface ActionSummary {
	type: string; // "add_member" | "add_editor" | "publish" | ...
	target_address?: string | null;
	[key: string]: unknown;
}

/** Fields present on every webhook event. */
export interface BaseEvent {
	version?: number;
	event_type: string;
	category?: string;
	space_id: string;
	space_name?: string | null;
	user_space_id?: string | null;
	idempotency_key?: string;
	block_number?: number | null;
	timestamp?: number | null;
}

/** `proposal_created` — the only event the MVP turns into a notification. */
export interface ProposalCreatedEvent extends BaseEvent {
	event_type: "proposal_created";
	proposal_id: string;
	proposal_name?: string | null;
	proposer_id?: string | null;
	proposer_name?: string | null;
	voting_mode?: string | null;
	actions?: ActionSummary[] | null;
}

export function isProposalCreated(event: BaseEvent): event is ProposalCreatedEvent {
	return event.event_type === "proposal_created";
}

/**
 * The webhook event types this server acts on. Every other type (proposal_voted,
 * proposal_executed, bounty_*, …) is acknowledged and dropped without writing
 * anything. Add a type here once we actually handle it.
 *
 * Today this is only `proposal_created` — the three MVP notification types
 * (editorship / membership / new proposal) are all classified from its actions.
 */
export const SUPPORTED_EVENT_TYPES = ["proposal_created"] as const;

export function isSupportedEventType(eventType: string): boolean {
	return (SUPPORTED_EVENT_TYPES as readonly string[]).includes(eventType);
}
