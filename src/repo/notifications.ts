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
