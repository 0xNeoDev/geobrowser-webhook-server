// Seed the webhook server's app-db with the demo recipient identity, so a
// notification addressed to DEMO_USER_SPACE_ID resolves to a real email.
//
// Uses the production `upsertUser` repo helper (so it also creates the default
// notification_preferences row) — i.e. it seeds exactly what a real sign-up
// would, not a hand-rolled row. Idempotent.
//
// Env (see scripts/demo.env.example):
//   DEMO_USER_SPACE_ID  (required) — your personal space uuid (the recipient)
//   DEMO_EMAIL          (default neo@wonderland.xyz)
//   DEMO_PRIVY_USER_ID  (default demo-neo) — stand-in Privy DID for the seed
// Plus the usual config env (DATABASE_URL, GEO_WEBHOOK_SECRET, PRIVY_APP_ID,
// PRIVY_APP_SECRET) which config.ts requires on import.
//
// Run:  bun run scripts/seed-demo-user.ts   (after sourcing your demo.env)

import { queryClient } from "../src/db/client";
import { db } from "../src/db/client";
import { isUuid } from "../src/lib/validate";
import { upsertUser } from "../src/repo/users";

const userSpaceId = process.env.DEMO_USER_SPACE_ID;
const email = process.env.DEMO_EMAIL ?? "neo@wonderland.xyz";
const privyUserId = process.env.DEMO_PRIVY_USER_ID ?? "demo-neo";

if (!userSpaceId) {
	console.error("DEMO_USER_SPACE_ID is required (your personal space uuid — the notification recipient).");
	process.exit(1);
}
if (!isUuid(userSpaceId)) {
	console.error(`DEMO_USER_SPACE_ID is not a valid uuid: ${userSpaceId}`);
	process.exit(1);
}

const row = await upsertUser(db, { privyUserId, userSpaceId, email });
console.log(`✓ seeded user: user_space_id=${row.userSpaceId} email=${row.email} (privy=${row.privyUserId})`);

await queryClient.end();
