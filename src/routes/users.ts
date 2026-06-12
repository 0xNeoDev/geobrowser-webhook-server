import { Hono } from "hono";
import { getPrivyEmail } from "../auth/privy";
import { db } from "../db/client";
import type { AppEnv } from "../http/env";
import { requirePrivyAuth } from "../http/middleware";
import { isUuid } from "../lib/validate";
import { upsertUser } from "../repo/users";

export const usersRoute = new Hono<AppEnv>();

usersRoute.use("*", requirePrivyAuth);

/**
 * Upsert the caller's identity. The front-end sends only `user_space_id`
 * (their personal space); `privy_user_id` comes from the verified token and
 * `email` is resolved server-side from Privy — the email is never trusted from
 * the request body. Also seeds default notification preferences.
 */
usersRoute.post("/", async (c) => {
	const privyUserId = c.get("privyUserId");

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid json" }, 400);
	}

	const userSpaceId = (body as { user_space_id?: unknown })?.user_space_id;
	if (!isUuid(userSpaceId)) {
		return c.json({ error: "user_space_id must be a UUID" }, 400);
	}

	const email = await getPrivyEmail(privyUserId);

	try {
		const user = await upsertUser(db, { privyUserId, userSpaceId, email });
		return c.json({
			id: user.id,
			user_space_id: user.userSpaceId,
			email: user.email,
		});
	} catch (err) {
		// Most likely the user_space_id is already claimed by another Privy user.
		console.error("[users] upsert failed", err);
		return c.json({ error: "could not upsert user (user_space_id may be in use)" }, 409);
	}
});
