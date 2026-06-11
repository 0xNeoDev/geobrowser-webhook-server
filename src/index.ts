import { Hono } from "hono";
import { config } from "./config";
import { db } from "./db/client";
import { verifySignature } from "./lib/signature";
import { ingestWebhook, MissingIdempotencyKeyError } from "./webhook/receiver";
import type { BaseEvent } from "./webhook/types";

const MAX_BODY_BYTES = 64 * 1024; // webhook payloads are small JSON

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

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

export { app };

export default {
	port: config.port,
	fetch: app.fetch,
};
