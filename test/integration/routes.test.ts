import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { resetAuthProvider, setAuthProvider } from "../../src/auth/privy";
import { db } from "../../src/db/client";
import { notifications } from "../../src/db/schema";
import { app } from "../../src/index";
import { PROPOSAL_ID, RUN, resetDb, SPACE_ID, USER_SPACE_ID } from "./db";

const PRIVY_ID = "did:privy:test-user";
const MOCK_EMAIL = "user@example.com";
const GOOD = "good-token";

/** Mock Privy: only GOOD resolves (to PRIVY_ID); everything else is rejected. */
function installMockAuth() {
	setAuthProvider({
		verifyToken: async (token) => {
			if (token !== GOOD) {
				throw new Error("invalid token");
			}
			return PRIVY_ID;
		},
		getEmail: async () => MOCK_EMAIL,
	});
}

function req(path: string, init: { method?: string; body?: unknown; token?: string | null } = {}) {
	const headers: Record<string, string> = { "content-type": "application/json" };
	if (init.token !== null) {
		headers.authorization = `Bearer ${init.token ?? GOOD}`;
	}
	return app.request(path, {
		method: init.method ?? "GET",
		headers,
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
}

async function seedNotification(idempotencyKey: string, userSpaceId = USER_SPACE_ID): Promise<string> {
	const [row] = await db
		.insert(notifications)
		.values({
			userSpaceId,
			eventType: "proposal_created",
			notificationType: "new_proposal",
			spaceId: SPACE_ID,
			proposalId: PROPOSAL_ID,
			payload: {},
			idempotencyKey,
		})
		.returning({ id: notifications.id });
	return row.id;
}

/** Register the caller (upsert) so requireUser resolves. */
async function register() {
	const res = await req("/users", { method: "POST", body: { user_space_id: USER_SPACE_ID } });
	expect(res.status).toBe(200);
}

describe.skipIf(!RUN)("routes (e2e, mocked Privy)", () => {
	beforeAll(installMockAuth);
	afterAll(resetAuthProvider);
	beforeEach(resetDb);

	describe("auth gating", () => {
		it("401 without a bearer token", async () => {
			expect((await req("/notifications", { token: null })).status).toBe(401);
		});

		it("401 with an invalid token", async () => {
			expect((await req("/notifications", { token: "nope" })).status).toBe(401);
		});

		it("403 when authenticated but not registered", async () => {
			expect((await req("/notifications")).status).toBe(403);
		});
	});

	describe("POST /users (upsert)", () => {
		it("creates the identity with the server-derived email", async () => {
			const res = await req("/users", { method: "POST", body: { user_space_id: USER_SPACE_ID } });
			expect(res.status).toBe(200);
			expect(await res.json()).toMatchObject({ user_space_id: USER_SPACE_ID, email: MOCK_EMAIL });
		});

		it("400 on a non-UUID user_space_id", async () => {
			expect((await req("/users", { method: "POST", body: { user_space_id: "nope" } })).status).toBe(400);
		});
	});

	describe("notifications + preferences (registered)", () => {
		beforeEach(register);

		it("lists only the caller's notifications and tracks unread/mark-read", async () => {
			const id = await seedNotification("a");
			await seedNotification("other", "20000000-0002-4000-8000-000000000099"); // different user

			const list = await (await req("/notifications")).json();
			expect(list.notifications).toHaveLength(1);
			const item = list.notifications[0];
			expect(item.id).toBe(id);
			// In-app feed item carries the shared per-type copy + proposal link.
			expect(item.title).toBe("New proposal");
			expect(item.body).toContain("A new proposal");
			expect(item.url).toContain("/governance?proposalId=");

			expect((await (await req("/notifications/unread-count")).json()).unread).toBe(1);

			const marked = await (await req("/notifications/mark-read", { method: "POST", body: { ids: [id] } })).json();
			expect(marked.updated).toBe(1);
			expect((await (await req("/notifications/unread-count")).json()).unread).toBe(0);
		});

		it("mark-all-read clears the badge", async () => {
			await seedNotification("a");
			await seedNotification("b");
			expect((await (await req("/notifications/mark-all-read", { method: "POST" })).json()).updated).toBe(2);
			expect((await (await req("/notifications/unread-count")).json()).unread).toBe(0);
		});

		it("400 on mark-read with non-UUID ids", async () => {
			expect((await req("/notifications/mark-read", { method: "POST", body: { ids: ["nope"] } })).status).toBe(400);
		});

		it("reads and updates preferences", async () => {
			expect(await (await req("/preferences")).json()).toEqual({ in_app_enabled: true, email_enabled: true });
			const updated = await (await req("/preferences", { method: "PUT", body: { email_enabled: false } })).json();
			expect(updated.email_enabled).toBe(false);
			expect((await (await req("/preferences")).json()).email_enabled).toBe(false);
		});
	});
});
