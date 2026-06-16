import { isEmailConfigured, sendEmail } from "../channels/email";
import { config } from "../config";
import type { Db } from "../db/client";
import { countEmailsSentLastHour, markEmailSent, type NotificationRow } from "../repo/notifications";
import { DEFAULT_PREFERENCES, getPreferences } from "../repo/preferences";
import { getUserByUserSpaceId } from "../repo/users";
import { emailContent } from "./copy";

/**
 * Outbound-delivery dependencies. Injectable so the gating/rate-limit logic is
 * testable without live MailerSend (the default wires the real channel + config).
 */
export interface EmailDeps {
	isConfigured: () => boolean;
	send: (input: { to: string; subject: string; text: string; html?: string }) => Promise<void>;
	maxPerRecipientPerHour: number;
}

function defaultEmailDeps(): EmailDeps {
	return {
		isConfigured: isEmailConfigured,
		send: sendEmail,
		maxPerRecipientPerHour: config.emailMaxPerRecipientPerHour,
	};
}

/**
 * Fan a freshly-stored notification out to outbound channels. In-app delivery is
 * already satisfied by the persisted row, so the MVP's only outbound channel is
 * email. Best-effort: failures are logged, never thrown — the webhook is acked
 * because the durable (in-app) delivery already happened.
 */
export async function deliverOutbound(
	db: Db,
	notification: NotificationRow,
	deps: EmailDeps = defaultEmailDeps(),
): Promise<void> {
	await deliverEmail(db, notification, deps).catch((err) => {
		console.error(`[deliver] email failed for notification=${notification.id}`, err);
	});
}

async function deliverEmail(db: Db, notification: NotificationRow, deps: EmailDeps): Promise<void> {
	if (!deps.isConfigured()) {
		return;
	}

	const prefs = await getPreferences(db, notification.userSpaceId);
	if (!(prefs?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled)) {
		return;
	}

	const user = await getUserByUserSpaceId(db, notification.userSpaceId);
	if (!user?.email) {
		return; // recipient unknown or has no linked email
	}

	if (
		deps.maxPerRecipientPerHour > 0 &&
		(await countEmailsSentLastHour(db, notification.userSpaceId)) >= deps.maxPerRecipientPerHour
	) {
		console.warn(
			`[deliver] email rate-limited for user_space_id=${notification.userSpaceId} (cap=${deps.maxPerRecipientPerHour}/h)`,
		);
		return;
	}

	const { subject, text, html } = emailContent({
		notificationType: notification.notificationType,
		spaceName: notification.spaceName,
		proposalName: notification.proposalName,
		spaceId: notification.spaceId,
		proposalId: notification.proposalId,
		baseUrl: config.geobrowserBaseUrl,
	});

	await deps.send({ to: user.email, subject, text, html });
	await markEmailSent(db, notification.id);
}
