# Local End-to-End Demo — live chain → email

**Goal (the video):** run the Geo notification stack locally, point it at the
**live Geo testnet**, then make a real governance proposal in the Geo Browser UI
and watch the resulting **editor/member request email** land in
`neo@wonderland.xyz`.

**Demo tooling in this repo** (all you need lives here + the gaia services):
- `scripts/demo.env.example` → copy to `scripts/demo.env` (gitignored) and fill in.
- `scripts/seed-demo.sh` → one command, seeds both databases idempotently (§4.4).
- `scripts/seed-demo-user.ts` → the webhook-app-db user seed (called by the above).

> The proposal is a **real on-chain transaction** on Geo testnet (chain `19411`,
> SpaceRegistry `0xB01683b2f0d38d43fcD4D9aAB980166988924132`). Nothing about the
> UI needs to point at localhost — you can use production `geobrowser.io` or a
> local `apps/web`. Only the **indexing + notification side** runs locally and
> reads that same chain via substreams. That's the whole trick.

---

## 1. Pipeline at a glance

```
                          ┌─────────────── runs LOCALLY ───────────────────────────────┐
Geo Browser UI            │                                                             │
(prod or local)           │   hermes-pipeline   notification-indexer   delivery-worker  │
      │ make proposal     │   (substreams sink)   (Kafka→outbox)        (outbox→webhook)│
      ▼                   │        │                   │                     │          │
  Geo testnet  ──substreams──▶  Kafka  ──space.governance──▶  Postgres (gaia)           │
  (chain 19411)            │  (PROPOSAL_CREATED)         editors→outbox→deliveries       │
                          │                                   │ HMAC POST               │
                          │                                   ▼                         │
                          │              geobrowser-webhook-server (:3001)              │
                          │              classify → persist → MailerSend ──▶ 📧 Gmail    │
                          └─────────────────────────────────────────────────────────────┘
```

Recipients of a `proposal_created` notification are **the editors of the
proposal's space** (`notification-indexer` runs `SELECT member_space_id FROM
editors WHERE space_id = $1`). The webhook server then maps each
`user_space_id` → email. So two things must be seeded: **`editors`** (gaia, who
gets notified) and **`users`** (webhook server, the email address).

---

## 2. Prerequisites

| Need | Notes / where |
|---|---|
| **`SUBSTREAMS_API_TOKEN`** | **Blocking.** Pinax token for `geotest.substreams.pinax.network`. Get from team/Pinax before recording. |
| **MailerSend** sending domain | `MAILERSEND_API_KEY` (already in `geobrowser-webhook-server/.env.local`) + a verified `MAILERSEND_FROM_EMAIL`. |
| Testnet wallet + a **governance-enabled space** you **edit** | **Must be a Public/DAO space, NOT a personal space.** Personal spaces have no governance, so no proposal can be made and no `PROPOSAL_CREATED` event ever fires. Create a Public space (you become its editor) or use a DAO space you already edit. |
| Toolchain | Docker (OrbStack), Rust/cargo, Bun. Postgres `psql` client. |

---

## 3. Topology — what runs where

| Component | Repo | How | Port |
|---|---|---|---|
| Kafka + Postgres (gaia) | `gaia` | `docker compose --profile infra up -d` | 9092 / 5432 |
| hermes-pipeline | `gaia` | `cargo run -p hermes-pipeline` | — |
| notification-indexer | `gaia` | `cargo run -p notification-indexer` | — |
| delivery-worker | `gaia` | `cargo run -p delivery-worker` | — |
| webhook server | `geobrowser-webhook-server` | `bun run dev` (**`PORT=3001`** — UI uses 3000) | 3001 |
| Geo Browser UI | prod `geobrowser.io` *or* `geogenesis/apps/web` | — | (3000) |

We **shortcut** the relational store: instead of running the heavy `kg-indexer`
to populate `spaces`/`editors` from chain, we seed those rows by hand (§4.4).
That's why we also disable the indexer's wait-for-kg step (§5).

---

## 4. One-time setup

### 4.1 gaia infra + migrations
```sh
cd ~/wonderland/geobrowser/gaia
docker compose --profile infra up -d            # kafka:9092, postgres:5432
cd api && bun install && bun run db:migrate      # creates editors/spaces/proposals/app_webhooks/notification_*
```

### 4.2 webhook server DB + run
The webhook server has its **own** Postgres (its `app-db`). For the demo, reuse a
local DB (e.g. the test Postgres on :5433, or a dedicated one):
```sh
cd ~/wonderland/geobrowser/geobrowser-webhook-server
# .env.local already holds MAILERSEND_API_KEY; add the rest:
#   DATABASE_URL=postgres://...   GEO_WEBHOOK_SECRET=<demo-secret>
#   PRIVY_APP_ID=x  PRIVY_APP_SECRET=x  (unused on the webhook path)
#   MAILERSEND_FROM_EMAIL=notifications@geobrowser.io
#   PORT=3001   GEOBROWSER_BASE_URL=https://www.geobrowser.io
bun run migrate
bun run dev
```

### 4.3 Capture the two identities (from the UI)
Log into Geo Browser with your wallet, then note:
- **`DEMO_SPACE_ID`** — the **governance-enabled** space you'll propose in (uuid).
- **`DEMO_USER_SPACE_ID`** — your **personal space id**. It's
  `getSpaceByAddress(<your smart-account address>)` (see
  `geogenesis/.../use-personal-space-id.ts`). This is the notification recipient.

### 4.4 Seed both databases (one command)
Copy the env template, fill in the two ids + DB URLs + secret, then run the
seeder. It's idempotent and does both sides:
- **gaia** — `spaces` + `editors` (makes you an editor of the demo space, so the
  indexer fans the notification out to you) + `app_webhooks` (the local target).
- **webhook app-db** — your `user_space_id → email`, via the production
  `upsertUser` helper (so it also creates the default preferences row — exactly
  what a real sign-up would).

```sh
cp scripts/demo.env.example scripts/demo.env   # then edit scripts/demo.env
scripts/seed-demo.sh                            # or: scripts/seed-demo.sh path/to/env
```
> `scripts/demo.env` is gitignored (it holds the webhook secret). The secret in
> it **must equal** the webhook server's `GEO_WEBHOOK_SECRET`, or the HMAC check
> (`X-Geo-Signature`) rejects the delivery POST. The seeder enforces that they
> come from the same env file.

> **Nicer copy (optional):** with no kg-indexer, `space_name` is `null`, so the
> email reads "New editor request" (no space). To get "New editor request in
> Crypto", seed the space's name entity, or just accept the generic copy.

---

## 5. Pre-recording warm-up (the timing-critical part)

A live substreams sink starting at block `138000` would take ages to reach the
chain head where your proposal lands — dead air on camera. Start it **near the
current head** so it's tailing live before you record.

```sh
# 1. find current testnet head (any testnet RPC / explorer), call it HEAD.
# 2. start hermes a small buffer behind it so it's caught up in seconds:
cd ~/wonderland/geobrowser/gaia
SUBSTREAMS_ENDPOINT=https://geotest.substreams.pinax.network:443 \
SUBSTREAMS_API_TOKEN=$SUBSTREAMS_API_TOKEN \
SUBSTREAMS_START_BLOCK=$((HEAD-200)) \
KAFKA_BROKER=localhost:9092 \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gaia \
cargo run -p hermes-pipeline
```
> The start block is **ignored if a cursor already exists** in the `meta` table.
> For a clean near-head start, use a fresh gaia DB or clear the cursor first.

Then the indexer — **disable the kg-catchup wait** (we have no kg-indexer), or
every notification stalls up to `BLOCK_DELAY_TIMEOUT_SECS`:
```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gaia \
KAFKA_BROKER=localhost:9092 \
ENVIRONMENT=production \
BLOCK_DELAY=0 \                        # default 2 — waits for kg-indexer
NOTIFICATION_MIN_AGE_SECS=259200 \     # default; live events are fresh so they pass
RUST_LOG=info,notification_indexer=debug \
cargo run -p notification-indexer
```
And the delivery-worker (snappy poll):
```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gaia \
POLL_INTERVAL_MS=2000 \
RUST_LOG=info,delivery_worker=debug \
cargo run -p delivery-worker
```

Confirm hermes prints recent block numbers (caught up to head) before you start
the take.

---

## 6. The take (on-camera sequence)

1. Show the 5 terminals tailing (hermes at head, indexer, delivery-worker,
   webhook server, an empty Gmail inbox).
2. In Geo Browser, open the demo space → **Propose add editor** (or add member /
   request editorship). Submit; show the on-chain tx confirm.
3. Watch the logs cascade:
   - hermes → `space.governance` `PROPOSAL_CREATED`
   - indexer → `Inserted per-user notifications recipients=1`
   - delivery-worker → POST → `delivered`
   - webhook server → classify → `email sent`
4. Cut to Gmail → the **"New editor request"** email arrives. Open it to show the
   branded HTML (logo, CTA, unsubscribe).

Repeat with **add member** (→ "New member request") and a plain edit (→ "New
proposal") to show all three copy variants.

---

## 7. Reliability: fallback for the recording

Live substreams latency (block time + Pinax lag) is the one thing you can't fully
control on camera. Two safeguards:

- **Rehearse** the full flow once end-to-end right before recording so the cursor
  is warm and timing is known.
- **Mock injector (B-roll):** `gaia/notification-service/e2e-tests/src/bin/demo_producer.rs`
  publishes a real-shaped `PROPOSAL_CREATED` to `space.governance` with a fresh
  timestamp and `DEMO_ACTION=add_editor|add_member`. If the live event stalls,
  this guarantees the downstream half (indexer → email) fires identically. Run it
  against the same `DEMO_SPACE_ID` you seeded:
  ```sh
  KAFKA_BROKER=localhost:9092 DEMO_SPACE_ID=$DEMO_SPACE_ID DEMO_ACTION=add_editor \
    cargo run -p notification-e2e-tests --bin demo_producer
  ```

---

## 8. "Always email neo" override (optional)

Seeding `users` (§4.4) is the clean path and needs no code change. If you'd
rather not depend on the `user_space_id` matching exactly, add a demo-only env
flag in the webhook server's `deliverEmail` that forces the recipient to
`neo@wonderland.xyz` when `DEMO_FORCE_EMAIL` is set. (We had this earlier and
removed it; can reintroduce behind the flag, gated off by default.)

---

## 9. Troubleshooting — "no email arrived", by hop

| Symptom | Check |
|---|---|
| hermes prints nothing | `SUBSTREAMS_API_TOKEN` valid? start block near head? cursor stale (clear `meta`)? |
| hermes runs, no `PROPOSAL_CREATED` | proposal landed after hermes's block? right chain (testnet 19411)? |
| indexer logs event but `recipients=0` | `editors` row for `DEMO_SPACE_ID` missing/typo (§4.4). This is the #1 cause. |
| indexer stalls ~30s per event | `BLOCK_DELAY` not 0 (waiting on absent kg-indexer). |
| indexer "Skipping old governance event" | event older than `NOTIFICATION_MIN_AGE_SECS` (only the mock injector with a stale ts). |
| delivery-worker `failed` 401/`signature` | `app_webhooks.secret` ≠ webhook server `GEO_WEBHOOK_SECRET`. |
| webhook server 2xx but no email | `users` row missing email; or MailerSend not configured (`isEmailConfigured`); or `email_enabled` off; or rate-limit cap hit. |
| email in spam / images hidden | DKIM not set for `geobrowser.io` (separate prod task; see go-live). |

---

## 10. Config cheat-sheet

**hermes-pipeline:** `SUBSTREAMS_ENDPOINT`, `SUBSTREAMS_API_TOKEN`,
`SUBSTREAMS_START_BLOCK`, `KAFKA_BROKER`, `DATABASE_URL`, `ENVIRONMENT`
**notification-indexer:** `DATABASE_URL`, `KAFKA_BROKER`, `ENVIRONMENT`,
`BLOCK_DELAY=0`, `BLOCK_DELAY_TIMEOUT_SECS`, `NOTIFICATION_MIN_AGE_SECS`
**delivery-worker:** `DATABASE_URL`, `POLL_INTERVAL_MS`
**webhook server:** `DATABASE_URL`, `GEO_WEBHOOK_SECRET`, `MAILERSEND_API_KEY`,
`MAILERSEND_FROM_EMAIL`, `PORT=3001`, `GEOBROWSER_BASE_URL`
