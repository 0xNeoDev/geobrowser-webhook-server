import { createMiddleware } from "hono/factory";
import { verifyPrivyToken } from "../auth/privy";
import { db } from "../db/client";
import { getUserByPrivyId } from "../repo/users";
import type { AppEnv } from "./env";

/**
 * Verify the `Authorization: Bearer <privy access token>` header and set
 * `privyUserId` on the context. The acting user is always derived from the
 * verified token — never from the request body.
 */
export const requirePrivyAuth = createMiddleware<AppEnv>(async (c, next) => {
	const header = c.req.header("authorization");
	const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
	if (!token) {
		return c.json({ error: "missing bearer token" }, 401);
	}

	let privyUserId: string;
	try {
		privyUserId = await verifyPrivyToken(token);
	} catch {
		return c.json({ error: "invalid token" }, 401);
	}

	c.set("privyUserId", privyUserId);
	await next();
});

/**
 * Resolve the verified Privy user to a local identity and set `userSpaceId`.
 * Returns 403 if the caller hasn't registered yet (no `users` row) — they must
 * call `POST /users` (upsert) first. Use after requirePrivyAuth.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
	const privyUserId = c.get("privyUserId");
	const user = await getUserByPrivyId(db, privyUserId);
	if (!user) {
		return c.json({ error: "user not registered" }, 403);
	}
	c.set("userSpaceId", user.userSpaceId);
	await next();
});
