import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notifications } from "../db/schema";

export type NotificationRow = typeof notifications.$inferSelect;

export const FEED_LIMIT = 100;

/** The user's notifications, newest first (capped at FEED_LIMIT). */
export async function listForUser(db: Db, userSpaceId: string, limit = FEED_LIMIT): Promise<NotificationRow[]> {
	return db
		.select()
		.from(notifications)
		.where(eq(notifications.userSpaceId, userSpaceId))
		.orderBy(desc(notifications.createdAt))
		.limit(limit);
}

/** Count of unread notifications (backs the badge). */
export async function unreadCount(db: Db, userSpaceId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(and(eq(notifications.userSpaceId, userSpaceId), isNull(notifications.readAt)));
	return row?.count ?? 0;
}

/** Mark specific notifications read (scoped to the caller). Returns rows affected. */
export async function markRead(db: Db, userSpaceId: string, ids: string[]): Promise<number> {
	if (ids.length === 0) {
		return 0;
	}
	const updated = await db
		.update(notifications)
		.set({ readAt: sql`now()` })
		.where(
			and(eq(notifications.userSpaceId, userSpaceId), inArray(notifications.id, ids), isNull(notifications.readAt)),
		)
		.returning({ id: notifications.id });
	return updated.length;
}

/** Mark all of the caller's unread notifications read. Returns rows affected. */
export async function markAllRead(db: Db, userSpaceId: string): Promise<number> {
	const updated = await db
		.update(notifications)
		.set({ readAt: sql`now()` })
		.where(and(eq(notifications.userSpaceId, userSpaceId), isNull(notifications.readAt)))
		.returning({ id: notifications.id });
	return updated.length;
}

/** Count emails sent to a recipient within the last rolling hour (rate limiting). */
export async function countEmailsSentLastHour(db: Db, userSpaceId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(notifications)
		.where(
			and(eq(notifications.userSpaceId, userSpaceId), sql`${notifications.emailSentAt} >= now() - interval '1 hour'`),
		);
	return row?.count ?? 0;
}

/**
 * The recorded outcome of the email channel for a notification — why it did or
 * didn't send. Stored in `notifications.email_status`.
 */
export type EmailStatus =
	| "sent"
	| "skipped_stale"
	| "skipped_ratelimited"
	| "disabled" // recipient turned email off (notification_preferences.email_enabled = false)
	| "no_recipient" // no registered user / no linked email
	| "unconfigured"; // MailerSend not set up (in-app-only deploy)

/**
 * Record the email outcome for a notification. `sent` also stamps `email_sent_at`
 * (which the per-recipient hourly rate-limit counts); other outcomes only set the
 * status, leaving `email_sent_at` null.
 */
export async function recordEmailOutcome(db: Db, id: string, status: EmailStatus): Promise<void> {
	await db
		.update(notifications)
		.set(status === "sent" ? { emailStatus: status, emailSentAt: sql`now()` } : { emailStatus: status })
		.where(eq(notifications.id, id));
}
