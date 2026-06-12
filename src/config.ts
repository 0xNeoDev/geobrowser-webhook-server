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

export const config = {
	port: numeric("PORT", 3000),
	databaseUrl: required("DATABASE_URL"),
	dbPoolMax: numeric("DB_POOL_MAX", 10),
	webhookSecret: required("GEO_WEBHOOK_SECRET"),
	privyAppId: required("PRIVY_APP_ID"),
	privyAppSecret: required("PRIVY_APP_SECRET"),

	// Email (MailerSend). Optional: if unset, the email channel is disabled
	// (notifications still land in-app). Lets us run in-app-only deploys / local dev.
	mailersendApiKey: optional("MAILERSEND_API_KEY"),
	mailersendFromEmail: optional("MAILERSEND_FROM_EMAIL"),
	mailersendFromName: optional("MAILERSEND_FROM_NAME") ?? "Geo",

	// Per-recipient email cap (rolling 1h window). 0 = unlimited (off).
	// Open product question — mechanism is built, default is off.
	emailMaxPerRecipientPerHour: numeric("EMAIL_MAX_PER_RECIPIENT_PER_HOUR", 0),
} as const;
