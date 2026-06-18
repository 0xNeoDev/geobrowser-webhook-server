import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
	| "pending" // awaiting the email worker (queued)
	| "sent"
	| "failed" // attempted but MailerSend errored after all retries (email lost; in-app still delivered)
	| "skipped_stale"
	| "skipped_ratelimited"
	| "disabled" // channel off (EMAIL_ENABLED=false) or recipient turned email off
	| "no_recipient" // no registered user / no linked email
	| "unconfigured"; // MailerSend not set up (in-app-only deploy)

/** Terminal outcomes — the worker is done with the row (no further attempts). */
export type TerminalEmailStatus = Exclude<EmailStatus, "pending">;

/**
 * Record a terminal email outcome for a notification. `sent` also stamps
 * `email_sent_at` (which the per-recipient hourly rate-limit counts); other
 * outcomes only set the status, leaving `email_sent_at` null.
 */
export async function recordEmailOutcome(db: Db, id: string, status: TerminalEmailStatus): Promise<void> {
	await db
		.update(notifications)
		.set(status === "sent" ? { emailStatus: status, emailSentAt: sql`now()` } : { emailStatus: status })
		.where(eq(notifications.id, id));
}

/**
 * Atomically claim up to `batchSize` due `pending` notifications for email
 * delivery and lease them (push `email_next_retry_at` `leaseSeconds` into the
 * future) so a concurrent worker / replica won't re-claim them while in flight.
 * `FOR UPDATE SKIP LOCKED` makes this safe across the deployment's replicas.
 */
export async function claimPendingEmails(db: Db, batchSize: number, leaseSeconds: number): Promise<NotificationRow[]> {
	return db.transaction(async (tx) => {
		const due = await tx
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.emailStatus, "pending"),
					or(isNull(notifications.emailNextRetryAt), lte(notifications.emailNextRetryAt, sql`now()`)),
				),
			)
			.orderBy(asc(notifications.createdAt))
			.limit(batchSize)
			.for("update", { skipLocked: true });

		if (due.length === 0) {
			return [];
		}
		return tx
			.update(notifications)
			.set({ emailNextRetryAt: sql`now() + ${leaseSeconds} * interval '1 second'` })
			.where(
				inArray(
					notifications.id,
					due.map((r) => r.id),
				),
			)
			.returning();
	});
}

/** Reschedule a notification for another email attempt after `backoffSeconds`. */
export async function rescheduleEmail(db: Db, id: string, attempts: number, backoffSeconds: number): Promise<void> {
	await db
		.update(notifications)
		.set({
			emailStatus: "pending",
			emailAttempts: attempts,
			emailNextRetryAt: sql`now() + ${backoffSeconds} * interval '1 second'`,
		})
		.where(eq(notifications.id, id));
}

/** Give up: mark the email permanently failed after exhausting retries. */
export async function failEmail(db: Db, id: string, attempts: number): Promise<void> {
	await db
		.update(notifications)
		.set({ emailStatus: "failed", emailAttempts: attempts })
		.where(eq(notifications.id, id));
}
