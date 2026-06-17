import { Hono } from "hono";
import { config } from "./config";
import { db, queryClient } from "./db/client";
import type { AppEnv } from "./http/env";
import { verifySignature } from "./lib/signature";
import { notificationsRoute } from "./routes/notifications";
import { preferencesRoute } from "./routes/preferences";
import { usersRoute } from "./routes/users";
import { ingestWebhook, MissingIdempotencyKeyError } from "./webhook/receiver";
import type { BaseEvent } from "./webhook/types";

const MAX_BODY_BYTES = 64 * 1024; // webhook payloads are small JSON

const app = new Hono<AppEnv>();

// Liveness: the process is up (no dependencies checked).
app.get("/health", (c) => c.json({ status: "ok" }));

// Readiness: safe to receive traffic — verifies the DB is reachable. k8s should
// stop routing to a pod that can't reach Postgres rather than 500 every request.
app.get("/ready", async (c) => {
	try {
		await queryClient`select 1`;
		return c.json({ status: "ready" });
	} catch (err) {
		console.error("[ready] database check failed", err);
		return c.json({ status: "not ready", error: "database unreachable" }, 503);
	}
});

// Inbound webhook from the Gaia delivery-worker. Authenticated by HMAC
// signature (not Privy) — see WEBHOOK_INTEGRATION.md.
app.post("/webhooks/geo", async (c) => {
	const signature = c.req.header("x-geo-signature");
	if (!signature) {
		return c.text("missing signature", 401);
	}

	const rawBody = await c.req.arrayBuffer();
	if (rawBody.byteLength > MAX_BODY_BYTES) {
		return c.text("payload too large", 413);
	}

	if (!(await verifySignature(rawBody, config.webhookSecret, signature))) {
		return c.text("invalid signature", 401);
	}

	let event: BaseEvent;
	try {
		event = JSON.parse(new TextDecoder().decode(rawBody)) as BaseEvent;
	} catch {
		return c.text("invalid json", 400);
	}
	if (!event || typeof event !== "object" || typeof event.event_type !== "string") {
		return c.text("invalid payload", 400);
	}

	try {
		const result = await ingestWebhook(db, event);
		if (result === "duplicate") {
			return c.text("duplicate", 409);
		}
		return c.text("ok", 200);
	} catch (err) {
		if (err instanceof MissingIdempotencyKeyError) {
			return c.text("missing idempotency_key", 400);
		}
		console.error("[webhook] ingest failed", err);
		return c.text("internal error", 500);
	}
});

// Authenticated user-facing APIs (Privy Bearer token).
app.route("/users", usersRoute);
app.route("/notifications", notificationsRoute);
app.route("/preferences", preferencesRoute);

export { app };

export default {
	port: config.port,
	fetch: app.fetch,
};
