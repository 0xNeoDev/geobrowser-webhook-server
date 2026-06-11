import { Hono } from "hono";
import { db } from "../db/client";
import type { AppEnv } from "../http/env";
import { requirePrivyAuth, requireUser } from "../http/middleware";
import { isUuid } from "../lib/validate";
import { listForUser, markAllRead, markRead, unreadCount } from "../repo/notifications";

export const notificationsRoute = new Hono<AppEnv>();

notificationsRoute.use("*", requirePrivyAuth, requireUser);

/** List the caller's notifications, newest first (limit 100). */
notificationsRoute.get("/", async (c) => {
	const rows = await listForUser(db, c.get("userSpaceId"));
	return c.json({ notifications: rows });
});

/** Unread count for the badge. */
notificationsRoute.get("/unread-count", async (c) => {
	const count = await unreadCount(db, c.get("userSpaceId"));
	return c.json({ unread: count });
});

/** Mark one or more notifications read. Body: { ids: string[] }. */
notificationsRoute.post("/mark-read", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid json" }, 400);
	}

	const ids = (body as { ids?: unknown })?.ids;
	if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid)) {
		return c.json({ error: "ids must be a non-empty array of UUIDs" }, 400);
	}

	const updated = await markRead(db, c.get("userSpaceId"), ids);
	return c.json({ updated });
});

/** Mark all of the caller's notifications read. */
notificationsRoute.post("/mark-all-read", async (c) => {
	const updated = await markAllRead(db, c.get("userSpaceId"));
	return c.json({ updated });
});
