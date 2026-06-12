import type { NotificationType } from "../webhook/classify";

export interface EmailContent {
	subject: string;
	text: string;
}

/**
 * Build the email subject/body for a notification. Pure (no I/O) so it's unit-testable.
 *
 * NOTE: this is placeholder copy — final user-facing wording is a product
 * decision (see PRD "Classification/labeling rule"). Keep it neutral until then.
 */
export function emailContent(input: {
	notificationType: string;
	spaceName: string | null;
	proposalName: string | null;
}): EmailContent {
	const where = input.spaceName ? ` in ${input.spaceName}` : "";
	const which = input.proposalName ? ` ("${input.proposalName}")` : "";

	const label: Record<NotificationType, string> = {
		editorship_request: "editorship request",
		membership_request: "membership request",
		new_proposal: "proposal",
	};
	const kind = label[input.notificationType as NotificationType] ?? "proposal";

	return {
		subject: `New ${kind}${where}`,
		text: `A new ${kind}${which} is awaiting your attention${where}. Open Geo Browser to review and vote.`,
	};
}
