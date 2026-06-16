import type { NotificationType } from "../webhook/classify";
import { emailHtml } from "./email-html";

/**
 * Channel-agnostic display copy for a notification — the single source of truth
 * for the per-type string used by **in-app** (the feed/API), **push** (when
 * built), and **email** (subject/body below).
 */
export interface NotificationCopy {
	title: string;
	body: string;
}

/** Build a Geo Browser proposal URL (dash-less, lowercase IDs — see geogenesis NavUtils.toProposal). */
export function buildProposalUrl(baseUrl: string, spaceId: string, proposalId: string): string {
	const hex = (id: string) => id.replace(/-/g, "").toLowerCase();
	const base = baseUrl.replace(/\/+$/, "");
	return `${base}/space/${hex(spaceId)}/governance?proposalId=${hex(proposalId)}`;
}

/**
 * Build the two unsubscribe links shown in the email footer: one scoped to the
 * originating space, one for all Geo notifications. Both point at the Geo Browser
 * notification settings page (space id dash-less + lowercase, as elsewhere).
 */
export function buildUnsubscribeUrls(baseUrl: string, spaceId: string): { space: string; all: string } {
	const base = baseUrl.replace(/\/+$/, "");
	const hex = spaceId.replace(/-/g, "").toLowerCase();
	return {
		space: `${base}/settings/notifications?space=${hex}`,
		all: `${base}/settings/notifications`,
	};
}

/**
 * Per-type notification copy. The wording differs by notification type:
 *   editorship_request → editor request, membership_request → member request,
 *   else → proposal. Placeholder copy — final wording is a product decision.
 */
export function notificationCopy(input: {
	notificationType: string;
	spaceName: string | null;
	proposalName: string | null;
}): NotificationCopy {
	const where = input.spaceName ? ` in ${input.spaceName}` : "";
	const which = input.proposalName ? ` "${input.proposalName}"` : "";

	switch (input.notificationType as NotificationType) {
		case "editorship_request":
			return {
				title: `New editor request${where}`,
				body: `An editor request${which} is awaiting your vote${where}.`,
			};
		case "membership_request":
			return {
				title: `New member request${where}`,
				body: `A member request${which} is awaiting your vote${where}.`,
			};
		default: // new_proposal (and any unknown type)
			return {
				title: `New proposal${where}`,
				body: `A new proposal${which} is awaiting your vote${where}.`,
			};
	}
}

export interface EmailContent {
	subject: string;
	text: string;
	html: string;
}

/**
 * Email rendering of a notification: the shared `notificationCopy` (subject =
 * title, body = body) plus a link to the proposal when known. Returns both a
 * plain-text part (fallback / accessibility) and the branded HTML body.
 */
export function emailContent(input: {
	notificationType: string;
	spaceName: string | null;
	proposalName: string | null;
	spaceId: string;
	proposalId: string | null;
	baseUrl: string;
}): EmailContent {
	const { title, body } = notificationCopy(input);
	const link = input.proposalId ? buildProposalUrl(input.baseUrl, input.spaceId, input.proposalId) : null;
	const unsubscribe = buildUnsubscribeUrls(input.baseUrl, input.spaceId);

	return {
		subject: title,
		text: link ? `${body}\n\nReview and vote: ${link}` : `${body} Open Geo Browser to review and vote.`,
		html: emailHtml({
			title,
			body,
			url: link,
			spaceName: input.spaceName,
			unsubscribeSpaceUrl: unsubscribe.space,
			unsubscribeAllUrl: unsubscribe.all,
		}),
	};
}
