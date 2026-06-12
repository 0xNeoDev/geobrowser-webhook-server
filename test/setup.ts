// Bun test preload (see bunfig.toml [test].preload). Runs before any test
// module loads, so config never throws on import.
//
// Integration tests run only when a real DATABASE_URL is provided; otherwise
// they self-skip. We capture that intent here, then fill dummy values so the
// config loader is satisfied for unit tests.
process.env.RUN_INTEGRATION = process.env.DATABASE_URL ? "1" : "";

process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@localhost:5432/placeholder";
process.env.GEO_WEBHOOK_SECRET ||= "test-secret";
process.env.PRIVY_APP_ID ||= "test-app-id";
process.env.PRIVY_APP_SECRET ||= "test-app-secret";
