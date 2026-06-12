import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { notificationPreferences, users } from "../db/schema";

export type UserRow = typeof users.$inferSelect;

export async function getUserByPrivyId(db: Db, privyUserId: string): Promise<UserRow | null> {
	const rows = await db.select().from(users).where(eq(users.privyUserId, privyUserId)).limit(1);
	return rows[0] ?? null;
}

export async function getUserByUserSpaceId(db: Db, userSpaceId: string): Promise<UserRow | null> {
	const rows = await db.select().from(users).where(eq(users.userSpaceId, userSpaceId)).limit(1);
	return rows[0] ?? null;
}

/**
 * Upsert the caller's identity (keyed by Privy DID) and ensure a default
 * preferences row exists. `email` is resolved server-side from Privy.
 */
export async function upsertUser(
	db: Db,
	input: { privyUserId: string; userSpaceId: string; email: string | null },
): Promise<UserRow> {
	return db.transaction(async (tx) => {
		const [row] = await tx
			.insert(users)
			.values({ privyUserId: input.privyUserId, userSpaceId: input.userSpaceId, email: input.email })
			.onConflictDoUpdate({
				target: users.privyUserId,
				set: { userSpaceId: input.userSpaceId, email: input.email, updatedAt: sql`now()` },
			})
			.returning();
		await tx.insert(notificationPreferences).values({ userSpaceId: input.userSpaceId }).onConflictDoNothing();
		return row;
	});
}
