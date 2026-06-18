import { type EmailChannelStatus, emailChannelStatus, sendEmail } from "../channels/email";
import { config } from "../config";
import type { Db } from "../db/client";
import {
	countEmailsSentLastHour,
	failEmail,
	type NotificationRow,
	recordEmailOutcome,
	rescheduleEmail,
} from "../repo/notifications";
import { DEFAULT_PREFERENCES, getPreferences } from "../repo/preferences";
import { getUserByUserSpaceId } from "../repo/users";
import { emailContent } from "./copy";

const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 3600;

/** Exponential backoff for the Nth send attempt: 30s, 60s, 120s, … capped at 1h. */
function backoffSeconds(attempt: number): number {
	return Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempt - 1), BACKOFF_MAX_SECONDS);
}

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
	/** Send attempts before the email is marked `failed`. */
	maxAttempts: number;
}

function defaultEmailDeps(): EmailDeps {
	return {
		channelStatus: emailChannelStatus,
		send: sendEmail,
		maxPerRecipientPerHour: config.emailMaxPerRecipientPerHour,
		staleThresholdSeconds: config.staleThresholdDays * 86400, // days → seconds at the config boundary
		maxAttempts: config.emailMaxAttempts,
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
 * Process the email channel for one (claimed, `pending`) notification: run the
 * gating, attempt the send, and record the outcome — or reschedule for a later
 * attempt on a transient failure. Called by the email worker, once per row.
 * In-app delivery already happened (the persisted row), so this is best-effort:
 * unexpected errors are logged, never thrown, leaving the row `pending` to be
 * retried on the next poll.
 */
export async function deliverOutbound(
	db: Db,
	notification: NotificationRow,
	deps: EmailDeps = defaultEmailDeps(),
): Promise<void> {
	await deliverEmail(db, notification, deps).catch((err) => {
		console.error(`[deliver] unexpected error for notification=${notification.id}`, err);
	});
}

async function deliverEmail(db: Db, notification: NotificationRow, deps: EmailDeps): Promise<void> {
	// Each early return records WHY no email went out (notifications.email_status),
	// turning "why didn't this send?" into a query instead of a log dig.
	const channel = deps.channelStatus();
	if (channel !== "ok") {
		await recordEmailOutcome(db, notification.id, channel); // "disabled" | "unconfigured"
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
		// MailerSend errored (after sendEmail's own quick transient retries). Retry
		// durably across poll cycles with backoff until maxAttempts, then give up.
		const attempts = notification.emailAttempts + 1;
		if (attempts >= deps.maxAttempts) {
			console.error(
				`[deliver] email permanently failed for notification=${notification.id} after ${attempts} attempts`,
				err,
			);
			await failEmail(db, notification.id, attempts);
		} else {
			const backoff = backoffSeconds(attempts);
			console.warn(
				`[deliver] email attempt ${attempts}/${deps.maxAttempts} failed for notification=${notification.id}; retry in ${backoff}s`,
				err,
			);
			await rescheduleEmail(db, notification.id, attempts, backoff);
		}
		return;
	}
	await recordEmailOutcome(db, notification.id, "sent");
}
