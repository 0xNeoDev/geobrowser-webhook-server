// Runtime configuration, loaded and validated from the environment.
// Imported only by runtime modules (entrypoint, db client, auth, delivery),
// never by the pure logic/helpers — so unit tests don't require env vars.

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function optional(name: string): string | undefined {
	return process.env[name] || undefined;
}

function numeric(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
	}
	return parsed;
}

function boolean(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw === undefined || raw.trim() === "") {
		return fallback;
	}
	// Anything other than an explicit falsey value counts as true.
	return !/^(false|0|no|off)$/i.test(raw.trim());
}

export const config = {
	port: numeric("PORT", 3000),
	databaseUrl: required("DATABASE_URL"),
	dbPoolMax: numeric("DB_POOL_MAX", 10),
	webhookSecret: required("GEO_WEBHOOK_SECRET"),
	privyAppId: required("PRIVY_APP_ID"),
	privyAppSecret: required("PRIVY_APP_SECRET"),

	// Email channel kill-switch. Default on; set EMAIL_ENABLED=false to stop ALL
	// outbound email (notifications still persist in-app) without touching the
	// MailerSend credentials — an operational lever for staged rollout / incidents.
	emailEnabled: boolean("EMAIL_ENABLED", true),

	// Email (MailerSend). Optional: if unset, the email channel is disabled
	// (notifications still land in-app). Lets us run in-app-only deploys / local dev.
	mailersendApiKey: optional("MAILERSEND_API_KEY"),
	mailersendFromEmail: optional("MAILERSEND_FROM_EMAIL"),
	mailersendFromName: optional("MAILERSEND_FROM_NAME") ?? "Geo",

	// Per-recipient email cap (rolling 1h window). 0 = unlimited (off).
	// Open product question — mechanism is built, default is off.
	emailMaxPerRecipientPerHour: numeric("EMAIL_MAX_PER_RECIPIENT_PER_HOUR", 0),

	// Staleness gate: skip email for events whose on-chain (block) timestamp is
	// older than this many DAYS. Recovery safety — after a long outage/backlog,
	// don't blast emails for old proposals. Default 5; set to 0 to disable.
	staleThresholdDays: numeric("STALE_THRESHOLD_DAYS", 5),

	// Email outbox worker (durable async delivery, decoupled from the webhook ack).
	emailWorkerPollMs: numeric("EMAIL_WORKER_POLL_MS", 2000), // poll cadence for pending email
	emailClaimBatch: numeric("EMAIL_CLAIM_BATCH", 20), // rows claimed per poll
	emailMaxAttempts: numeric("EMAIL_MAX_ATTEMPTS", 6), // send attempts before `failed` (~30s→16m backoff)
	emailLeaseSeconds: numeric("EMAIL_LEASE_SECONDS", 120), // claim lease; reclaimed if a worker dies mid-send

	// Base URL for Geo Browser links in emails (override per environment).
	geobrowserBaseUrl: optional("GEOBROWSER_BASE_URL") ?? "https://www.geobrowser.io",
} as const;
