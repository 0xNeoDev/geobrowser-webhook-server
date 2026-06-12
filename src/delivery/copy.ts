import type { NotificationType } from "../webhook/classify";

export interface EmailContent {
	subject: string;
	text: string;
}

/**
 * Build a Geo Browser proposal URL. Geo Browser uses dash-less, lowercase IDs
 * in its routes (see geogenesis `NavUtils.toProposal` + `id.replace(/-/g,'')`):
 *   {base}/space/{spaceId}/governance?proposalId={proposalId}
 */
export function buildProposalUrl(baseUrl: string, spaceId: string, proposalId: string): string {
	const hex = (id: string) => id.replace(/-/g, "").toLowerCase();
	const base = baseUrl.replace(/\/+$/, "");
	return `${base}/space/${hex(spaceId)}/governance?proposalId=${hex(proposalId)}`;
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
	spaceId: string;
	proposalId: string | null;
	baseUrl: string;
}): EmailContent {
	const where = input.spaceName ? ` in ${input.spaceName}` : "";
	const which = input.proposalName ? ` ("${input.proposalName}")` : "";

	const label: Record<NotificationType, string> = {
		editorship_request: "editorship request",
		membership_request: "membership request",
		new_proposal: "proposal",
	};
	const kind = label[input.notificationType as NotificationType] ?? "proposal";

	const link = input.proposalId ? buildProposalUrl(input.baseUrl, input.spaceId, input.proposalId) : null;
	const body = `A new ${kind}${which} is awaiting your attention${where}.`;

	return {
		subject: `New ${kind}${where}`,
		text: link ? `${body}\n\nReview and vote: ${link}` : `${body} Open Geo Browser to review and vote.`,
	};
}
