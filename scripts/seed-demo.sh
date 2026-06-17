#!/usr/bin/env bash
# Seed both databases for the local end-to-end demo, idempotently:
#   1. gaia        — register NEO as an editor of the demo space + the local webhook target
#   2. webhook db  — map NEO's user_space_id -> his email (via the upsertUser repo helper)
#
# Usage:  scripts/seed-demo.sh [env-file]   (default: scripts/demo.env)
# See docs/LOCAL_DEMO.md for the full runbook.
set -euo pipefail

ENV_FILE="${1:-$(dirname "$0")/demo.env}"
if [[ ! -f "$ENV_FILE" ]]; then
	echo "env file not found: $ENV_FILE (copy scripts/demo.env.example -> scripts/demo.env and fill it in)" >&2
	exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

require() { [[ -n "${!1:-}" ]] || { echo "missing required env: $1 (set it in $ENV_FILE)" >&2; exit 1; }; }
require DEMO_SPACE_ID
require DEMO_USER_SPACE_ID
require GAIA_DB_URL
require WEBHOOK_URL
require GEO_WEBHOOK_SECRET
require DATABASE_URL

echo "→ seeding gaia ($GAIA_DB_URL): space + editor + webhook"
psql "$GAIA_DB_URL" -v ON_ERROR_STOP=1 <<SQL
-- spaces.type is the "spaceTypes" enum (DAO | Personal); a governance demo needs DAO.
-- address is NOT NULL but unused by the notification fan-out, so a placeholder is fine.
INSERT INTO spaces (id, type, address)
  VALUES ('${DEMO_SPACE_ID}', 'DAO', '${DEMO_SPACE_ADDRESS:-0x0000000000000000000000000000000000000000}')
  ON CONFLICT DO NOTHING;
INSERT INTO editors (member_space_id, space_id) VALUES ('${DEMO_USER_SPACE_ID}', '${DEMO_SPACE_ID}')
  ON CONFLICT DO NOTHING;
INSERT INTO app_webhooks (app_name, url, secret) VALUES ('geobrowser-local', '${WEBHOOK_URL}', '${GEO_WEBHOOK_SECRET}')
  ON CONFLICT (app_name) DO UPDATE SET url = EXCLUDED.url, secret = EXCLUDED.secret;
SQL
echo "  ✓ gaia seeded (editor=${DEMO_USER_SPACE_ID} of space=${DEMO_SPACE_ID})"

# Optional: the space name shown in emails ("… in <name>"). The indexer resolves it
# from the values table (name property a126ca53-…). Skipped if DEMO_SPACE_NAME unset.
# NOTE: a proposal's NAME can't be seeded — it's per-proposal and enriched live by the
# kg-indexer (absent locally), so emails won't include a proposal name in this setup.
if [[ -n "${DEMO_SPACE_NAME:-}" ]]; then
	psql "$GAIA_DB_URL" -v ON_ERROR_STOP=1 -c \
"INSERT INTO \"values\" (id, property_id, entity_id, space_id, text)
 VALUES ('demo:name:${DEMO_SPACE_ID}', 'a126ca53-0c8e-48d5-b888-82c734c38935', '${DEMO_SPACE_ID}', '${DEMO_SPACE_ID}', '${DEMO_SPACE_NAME}')
 ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text;" >/dev/null
	echo "  ✓ space name seeded: '${DEMO_SPACE_NAME}'"
fi

echo "→ seeding webhook app-db: user_space_id -> email"
bun run "$(dirname "$0")/seed-demo-user.ts"

echo "✓ demo seed complete. Next: start hermes-pipeline, notification-indexer (BLOCK_DELAY=0),"
echo "  delivery-worker, and the webhook server. See docs/LOCAL_DEMO.md §5–6."
