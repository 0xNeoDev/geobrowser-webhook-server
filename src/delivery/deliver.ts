import { type EmailChannelStatus, emailChannelStatus, sendEmail } from "../channels/email";
import { config } from "../config";
import type { Db } from "../db/client";
import { countEmailsSentLastHour, type NotificationRow, recordEmailOutcome } from "../repo/notifications";
import { DEFAULT_PREFERENCES, getPreferences } from "../repo/preferences";
import { getUserByUserSpaceId } from "../repo/users";
import { emailContent } from "./copy";

/**
 * Outbound-delivery dependencies. Injectable so the gating/rate-limit logic is
 * testable without live MailerSend (the default wires the real channel + config).
 */
export interface EmailDeps {
	channelStatus: () => EmailChannelStatus;
	send: (input: { to: string; subject: string; text: string; html?: string }) => Promise<void>;
	maxPerRecipientPerHour: number;
	/** Skip email for events older than this many seconds. 0 = no gate. */
	staleThresholdSeconds: number;
}

function defaultEmailDeps(): EmailDeps {
	return {
		channelStatus: emailChannelStatus,
		send: sendEmail,
		maxPerRecipientPerHour: config.emailMaxPerRecipientPerHour,
		staleThresholdSeconds: config.staleThresholdDays * 86400, // days → seconds at the config boundary
	};
}

/**
 * The event's on-chain (block) time in unix seconds, read from the stored payload
 * — NOT the row's `createdAt`. A backlog flush after an outage stores rows fresh,
 * so only the block timestamp reflects the event's true age. `null` if absent.
 */
function eventTimestampSeconds(notification: NotificationRow): number | null {
	const ts = (notification.payload as { timestamp?: unknown } | null | undefined)?.timestamp;
	return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
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
	// Each early return records WHY no email went out (notifications.email_status),
	// turning "why didn't this send?" into a query instead of a log dig.
	const channel = deps.channelStatus();
	if (channel !== "ok") {
		await recordEmailOutcome(db, notification.id, channel); // "unconfigured"
		return;
	}

	// Staleness gate (recovery safety): skip email for events older than the
	// threshold. Fail open — if the event has no timestamp, don't gate.
	if (deps.staleThresholdSeconds > 0) {
		const ts = eventTimestampSeconds(notification);
		if (ts !== null && Date.now() / 1000 - ts > deps.staleThresholdSeconds) {
			console.warn(
				`[deliver] email skipped — stale event for notification=${notification.id} (age > ${deps.staleThresholdSeconds}s cap)`,
			);
			await recordEmailOutcome(db, notification.id, "skipped_stale");
			return;
		}
	}

	const prefs = await getPreferences(db, notification.userSpaceId);
	if (!(prefs?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled)) {
		await recordEmailOutcome(db, notification.id, "disabled");
		return;
	}

	const user = await getUserByUserSpaceId(db, notification.userSpaceId);
	if (!user?.email) {
		await recordEmailOutcome(db, notification.id, "no_recipient"); // unknown recipient / no linked email
		return;
	}

	if (
		deps.maxPerRecipientPerHour > 0 &&
		(await countEmailsSentLastHour(db, notification.userSpaceId)) >= deps.maxPerRecipientPerHour
	) {
		console.warn(
			`[deliver] email rate-limited for user_space_id=${notification.userSpaceId} (cap=${deps.maxPerRecipientPerHour}/h)`,
		);
		await recordEmailOutcome(db, notification.id, "skipped_ratelimited");
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

	try {
		await deps.send({ to: user.email, subject, text, html });
	} catch (err) {
		// MailerSend errored after its retries — email is lost (in-app still delivered).
		// Recorded as `failed` so it's queryable / retryable by a future sweep.
		console.error(`[deliver] email send failed for notification=${notification.id}`, err);
		await recordEmailOutcome(db, notification.id, "failed");
		return;
	}
	await recordEmailOutcome(db, notification.id, "sent");
}
