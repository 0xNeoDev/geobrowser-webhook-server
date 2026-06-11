import { Hono } from "hono";
import { db } from "../db/client";
import type { AppEnv } from "../http/env";
import { requirePrivyAuth, requireUser } from "../http/middleware";
import { DEFAULT_PREFERENCES, getPreferences, upsertPreferences } from "../repo/preferences";

export const preferencesRoute = new Hono<AppEnv>();

preferencesRoute.use("*", requirePrivyAuth, requireUser);

/** Read the caller's per-channel preferences (defaults if none stored yet). */
preferencesRoute.get("/", async (c) => {
	const userSpaceId = c.get("userSpaceId");
	const prefs = await getPreferences(db, userSpaceId);
	return c.json({
		in_app_enabled: prefs?.inAppEnabled ?? DEFAULT_PREFERENCES.inAppEnabled,
		email_enabled: prefs?.emailEnabled ?? DEFAULT_PREFERENCES.emailEnabled,
	});
});

/** Update the caller's per-channel preferences. Body: { in_app_enabled?, email_enabled? }. */
preferencesRoute.put("/", async (c) => {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid json" }, 400);
	}

	const patch: { inAppEnabled?: boolean; emailEnabled?: boolean } = {};
	const inApp = (body as { in_app_enabled?: unknown })?.in_app_enabled;
	const email = (body as { email_enabled?: unknown })?.email_enabled;
	if (inApp !== undefined) {
		if (typeof inApp !== "boolean") {
			return c.json({ error: "in_app_enabled must be a boolean" }, 400);
		}
		patch.inAppEnabled = inApp;
	}
	if (email !== undefined) {
		if (typeof email !== "boolean") {
			return c.json({ error: "email_enabled must be a boolean" }, 400);
		}
		patch.emailEnabled = email;
	}
	if (patch.inAppEnabled === undefined && patch.emailEnabled === undefined) {
		return c.json({ error: "provide in_app_enabled and/or email_enabled" }, 400);
	}

	const prefs = await upsertPreferences(db, c.get("userSpaceId"), patch);
	return c.json({ in_app_enabled: prefs.inAppEnabled, email_enabled: prefs.emailEnabled });
});
