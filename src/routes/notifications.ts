import { Hono } from "hono";
import { config } from "../config";
import { db } from "../db/client";
import { buildProposalUrl, notificationCopy } from "../delivery/copy";
import type { AppEnv } from "../http/env";
import { requirePrivyAuth, requireUser } from "../http/middleware";
import { isUuid } from "../lib/validate";
import { listForUser, markAllRead, markRead, type NotificationRow, unreadCount } from "../repo/notifications";

export const notificationsRoute = new Hono<AppEnv>();

notificationsRoute.use("*", requirePrivyAuth, requireUser);

/**
 * Map a stored row to the in-app feed item, with the same per-type `title`/`body`
 * string used by email + push (via `notificationCopy`) and the proposal link.
 */
function toFeedItem(n: NotificationRow) {
	const { title, body } = notificationCopy(n);
	return {
		id: n.id,
		type: n.notificationType,
		title,
		body,
		url: n.proposalId ? buildProposalUrl(config.geobrowserBaseUrl, n.spaceId, n.proposalId) : null,
		space_id: n.spaceId,
		proposal_id: n.proposalId,
		read: n.readAt !== null,
		created_at: n.createdAt,
	};
}

/** List the caller's notifications, newest first (limit 100). */
notificationsRoute.get("/", async (c) => {
	const rows = await listForUser(db, c.get("userSpaceId"));
	return c.json({ notifications: rows.map(toFeedItem) });
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
