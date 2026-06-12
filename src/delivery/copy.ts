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

/** Per-type subject + lead sentence. Placeholder copy — final wording is product's. */
function templateFor(notificationType: string, where: string, which: string): { subject: string; lead: string } {
	switch (notificationType as NotificationType) {
		case "editorship_request":
			return {
				subject: `New editor request${where}`,
				lead: `An editor request${which} is awaiting your vote${where}.`,
			};
		case "membership_request":
			return {
				subject: `New member request${where}`,
				lead: `A member request${which} is awaiting your vote${where}.`,
			};
		default: // new_proposal (and any unknown type)
			return {
				subject: `New proposal${where}`,
				lead: `A new proposal${which} is awaiting your vote${where}.`,
			};
	}
}

/**
 * Build the email subject/body for a notification. Pure (no I/O) so it's
 * unit-testable. The wording differs by notification type (editor request /
 * member request / proposal), and includes a link to the proposal when known.
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

	const { subject, lead } = templateFor(input.notificationType, where, which);
	const link = input.proposalId ? buildProposalUrl(input.baseUrl, input.spaceId, input.proposalId) : null;

	return {
		subject,
		text: link ? `${lead}\n\nReview and vote: ${link}` : `${lead} Open Geo Browser to review and vote.`,
	};
}
