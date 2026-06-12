import { isEmailConfigured, sendEmail } from "../channels/email";
import { config } from "../config";
import type { Db } from "../db/client";
import { countEmailsSentLastHour, markEmailSent, type NotificationRow } from "../repo/notifications";
import { DEFAULT_PREFERENCES, getPreferences } from "../repo/preferences";
import { getUserByUserSpaceId } from "../repo/users";
import { emailContent } from "./copy";

/**
 * Fan a freshly-stored notification out to outbound channels. In-app delivery is
 * already satisfied by the persisted row, so the MVP's only outbound channel is
 * email. Best-effort: failures are logged, never thrown — the webhook is acked
 * because the durable (in-app) delivery already happened.
 */
export async function deliverOutbound(db: Db, notification: NotificationRow): Promise<void> {
	await deliverEmail(db, notification).catch((err) => {
		console.error(`[deliver] email failed for notification=${notification.id}`, err);
	});
}

async function deliverEmail(db: Db, notification: NotificationRow): Promise<void> {
	if (!isEmailConfigured()) {
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

	const cap = config.emailMaxPerRecipientPerHour;
	if (cap > 0 && (await countEmailsSentLastHour(db, notification.userSpaceId)) >= cap) {
		console.warn(`[deliver] email rate-limited for user_space_id=${notification.userSpaceId} (cap=${cap}/h)`);
		return;
	}

	const { subject, text } = emailContent({
		notificationType: notification.notificationType,
		spaceName: notification.spaceName,
		proposalName: notification.proposalName,
	});

	await sendEmail({ to: user.email, subject, text });
	await markEmailSent(db, notification.id);
}
