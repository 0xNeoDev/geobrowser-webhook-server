import type { ActionSummary } from "./types";

/** The MVP notification labels, derived from a proposal's actions. */
export type NotificationType = "editorship_request" | "membership_request" | "new_proposal";

/**
 * Classify a `proposal_created` event into one of the three MVP notification
 * types by inspecting its actions (PRD classification rule):
 *
 *   - contains `add_editor`  → editorship_request
 *   - else contains `add_member` → membership_request
 *   - else → new_proposal
 *
 * A proposal containing both is labeled by the higher-privilege action
 * (editor > member), which falls out of checking `add_editor` first.
 *
 * Final user-facing copy for each label is a product decision.
 */
export function classifyProposal(actions: ReadonlyArray<ActionSummary> | null | undefined): NotificationType {
	if (!actions || actions.length === 0) {
		return "new_proposal";
	}
	const has = (type: string) => actions.some((a) => a.type === type);
	if (has("add_editor")) {
		return "editorship_request";
	}
	if (has("add_member")) {
		return "membership_request";
	}
	return "new_proposal";
}
