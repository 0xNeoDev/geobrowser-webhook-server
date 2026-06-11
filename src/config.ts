// Runtime configuration, loaded and validated from the environment.
// Imported only by runtime modules (entrypoint, db client, auth), never by the
// pure logic/helpers — so unit tests don't require env vars.

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
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
} as const;
