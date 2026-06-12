import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notificationPreferences } from "../db/schema";

export type PreferencesRow = typeof notificationPreferences.$inferSelect;

/** Defaults applied when a user has no preferences row yet (all channels on). */
export const DEFAULT_PREFERENCES = { inAppEnabled: true, emailEnabled: true } as const;

export async function getPreferences(db: Db, userSpaceId: string): Promise<PreferencesRow | null> {
	const rows = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userSpaceId, userSpaceId))
		.limit(1);
	return rows[0] ?? null;
}

export async function upsertPreferences(
	db: Db,
	userSpaceId: string,
	patch: { inAppEnabled?: boolean; emailEnabled?: boolean },
): Promise<PreferencesRow> {
	const [row] = await db
		.insert(notificationPreferences)
		.values({ userSpaceId, ...patch })
		.onConflictDoUpdate({
			target: notificationPreferences.userSpaceId,
			set: { ...patch, updatedAt: sql`now()` },
		})
		.returning();
	return row;
}
