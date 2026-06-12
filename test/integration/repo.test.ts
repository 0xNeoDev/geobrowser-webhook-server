import { beforeEach, describe, expect, it } from "bun:test";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema";
import { listForUser, markAllRead, markRead, unreadCount } from "../../src/repo/notifications";
import { getPreferences, upsertPreferences } from "../../src/repo/preferences";
import { getUserByPrivyId, getUserByUserSpaceId, upsertUser } from "../../src/repo/users";
import { RUN, resetDb, SPACE_ID, USER_SPACE_ID } from "./db";

async function seedNotification(idempotencyKey: string): Promise<string> {
	const [row] = await db
		.insert(notifications)
		.values({
			userSpaceId: USER_SPACE_ID,
			eventType: "proposal_created",
			notificationType: "new_proposal",
			spaceId: SPACE_ID,
			payload: {},
			idempotencyKey,
		})
		.returning({ id: notifications.id });
	return row.id;
}

describe.skipIf(!RUN)("repo (integration)", () => {
	beforeEach(resetDb);

	it("upsertUser creates a user + default preferences and is idempotent on the Privy DID", async () => {
		const created = await upsertUser(db, {
			privyUserId: "did:privy:abc",
			userSpaceId: USER_SPACE_ID,
			email: "a@b.com",
		});
		expect(created.userSpaceId).toBe(USER_SPACE_ID);

		const prefs = await getPreferences(db, USER_SPACE_ID);
		expect(prefs?.emailEnabled).toBe(true);
		expect(prefs?.inAppEnabled).toBe(true);

		const updated = await upsertUser(db, {
			privyUserId: "did:privy:abc",
			userSpaceId: USER_SPACE_ID,
			email: "c@d.com",
		});
		expect(updated.email).toBe("c@d.com");
		expect(await getUserByPrivyId(db, "did:privy:abc")).not.toBeNull();
		expect(await getUserByUserSpaceId(db, USER_SPACE_ID)).not.toBeNull();
	});

	it("lists newest-first and tracks unread / mark-read / mark-all-read", async () => {
		const a = await seedNotification("a");
		await seedNotification("b");

		expect(await listForUser(db, USER_SPACE_ID)).toHaveLength(2);
		expect(await unreadCount(db, USER_SPACE_ID)).toBe(2);

		expect(await markRead(db, USER_SPACE_ID, [a])).toBe(1);
		expect(await unreadCount(db, USER_SPACE_ID)).toBe(1);
		expect(await markRead(db, USER_SPACE_ID, [a])).toBe(0); // already read → no-op

		expect(await markAllRead(db, USER_SPACE_ID)).toBe(1);
		expect(await unreadCount(db, USER_SPACE_ID)).toBe(0);
	});

	it("reads and updates preferences", async () => {
		await upsertPreferences(db, USER_SPACE_ID, { emailEnabled: false });
		expect((await getPreferences(db, USER_SPACE_ID))?.emailEnabled).toBe(false);
		await upsertPreferences(db, USER_SPACE_ID, { emailEnabled: true, inAppEnabled: false });
		const prefs = await getPreferences(db, USER_SPACE_ID);
		expect(prefs?.emailEnabled).toBe(true);
		expect(prefs?.inAppEnabled).toBe(false);
	});
});
