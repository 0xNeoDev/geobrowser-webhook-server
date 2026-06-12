# Local end-to-end demo — single email notification

**Goal:** run the real gaia notification pipeline locally, fire **one**
`proposal_created` event, and have the **delivery-worker call this server**, which
sends **one email to `neo@wonderland.xyz`** via MailerSend.

Scope kept tiny: **1 space, 1 editor (the recipient), 1 member, 1 proposal**.

---

## What actually has to run (and what we skip)

The notification-indexer resolves recipients (editors) from **Postgres tables**,
not from live kg-indexer output — so we don't need the full chain. We **seed the
DB** and **produce one governance event straight to Kafka**, exactly like gaia's
existing `notification-service/e2e-tests` harness does.

| Component | Run it? | Why |
|---|---|---|
| Kafka + Postgres | ✅ | from `gaia/notification-service/e2e-tests/docker-compose.yml` |
| notification-indexer | ✅ | consumes `space.governance`, fans out to editors → `notification_outbox` |
| delivery-worker | ✅ | reads outbox + `app_webhooks`, POSTs signed webhook |
| **geobrowser-webhook-server** | ✅ | receives webhook → classifies → emails |
| hermes / substreams / chain | ❌ | replaced by producing one protobuf event to Kafka |
| kg-indexer | ❌ (optional) | only needed for name *enrichment*; we seed names directly |
| Privy / front-end | ❌ | the webhook path isn't Privy-authed; email recipient is hardcoded |

```
seed 1 proposal_created ──▶ Kafka(space.governance) ──▶ notification-indexer
   │ (editors/members/app_webhooks seeded in gaia DB)        │ fan out to the 1 editor
   ▼                                                          ▼
 [gaia notif DB] ◀───────────────────────────────── notification_outbox / _deliveries
                                                              │
                                          delivery-worker POSTs (X-Geo-Signature)
                                                              ▼
                              geobrowser-webhook-server  /webhooks/geo
                                   verify → classify → persist (in-app)
                                                              │ email_enabled + recipient
                                                              ▼
                                            MailerSend ──▶ neo@wonderland.xyz
```

> **Two separate databases** (both can live in the one Postgres container):
> - **gaia notif DB** (`notifications_test`) — used by indexer + delivery-worker (`editors`, `app_webhooks`, `notification_outbox`, `notification_deliveries`).
> - **webhook-server DB** (`geobrowser_notifications`) — used by this server (`users`, `notifications`, `preferences`, `processed_webhooks`).

---

## Two small things to build first

1. **A one-shot governance producer.** A tiny Rust bin (or a `--demo` flag) that
   encodes one `proposal_created` protobuf and produces it to `space.governance`.
   Reuse the message-construction in `gaia/notification-service/e2e-tests/src/main.rs`
   (it already builds + produces these via `hermes-schema` + `rdkafka`) — carve out
   the single-event path for our space.
   - To make it a **membership request** (more interesting than a bare proposal),
     give the proposal an `add_member` action; otherwise it classifies as `new_proposal`.
2. **A demo recipient override in this server.** Add a demo-only env
   `DEMO_FORCE_EMAIL` that, when set, makes `deliverEmail` send to that address
   regardless of the `users` lookup. (Alternative, no code change: seed a `users`
   row mapping the editor's `user_space_id` → `neo@wonderland.xyz`.)

---

## Steps

### 1. Infra
```sh
cd gaia/notification-service/e2e-tests
docker compose up -d            # postgres :5433, kafka :9092
psql postgres://test:test@localhost:5433/notifications_test -f setup.sql
# second DB for our server, in the same Postgres:
psql postgres://test:test@localhost:5433/postgres -c 'CREATE DATABASE geobrowser_notifications;'
```

### 2. Seed the gaia notif DB (the one tiny space)
```sql
-- IDs are examples; reuse them consistently below.
INSERT INTO spaces (id, type) VALUES ('11111111-1111-4111-8111-111111111111','Public');
-- the recipient (editor) and a member who should NOT receive anything
INSERT INTO editors (member_space_id, space_id) VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');
INSERT INTO members (member_space_id, space_id) VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
-- point the delivery-worker at THIS server; secret must match GEO_WEBHOOK_SECRET below
INSERT INTO app_webhooks (app_name, url, secret)
VALUES ('geobrowser', 'http://localhost:3000/webhooks/geo', 'demo-secret-0123456789');
```

### 3. Run this server (host, port 3000)
```sh
cd geobrowser-webhook-server && bun install && bun run db:migrate   # migrates geobrowser_notifications
DATABASE_URL=postgres://test:test@localhost:5433/geobrowser_notifications \
GEO_WEBHOOK_SECRET=demo-secret-0123456789 \
PRIVY_APP_ID=demo PRIVY_APP_SECRET=demo \
MAILERSEND_API_KEY=$(grep MAILERSEND_API_KEY .env.local | cut -d= -f2) \
MAILERSEND_FROM_EMAIL=<addr-on-verified-domain> \
DEMO_FORCE_EMAIL=neo@wonderland.xyz \
bun run start
```

### 4. Run the gaia services (host, two terminals)
```sh
# notification-indexer
DATABASE_URL=postgres://test:test@localhost:5433/notifications_test \
KAFKA_BROKER=localhost:9092 ENVIRONMENT=production \
RUST_LOG=info,notification_indexer=debug \
cargo run -p notification-indexer

# delivery-worker
DATABASE_URL=postgres://test:test@localhost:5433/notifications_test \
POLL_INTERVAL_MS=2000 RUST_LOG=info,delivery_worker=debug \
cargo run -p delivery-worker
```
> `ENVIRONMENT=production` makes the Kafka topic prefix empty, so the indexer
> subscribes to `space.governance` (matching what we produce). The producer must
> target the same topic name.

### 5. Fire the one event
```sh
# the producer from "things to build", targeting space 1111... with an add_member action
cargo run -p <governance-seed> -- --space 11111111-1111-4111-8111-111111111111 --action add_member
```

---

## What you should see (verify each hop)
1. **Kafka:** one record on `space.governance` (`kafka-console-consumer ... --topic space.governance`).
2. **Indexer log:** resolves 1 editor for the space → writes 1 `notification_outbox` row (the member gets nothing).
3. **gaia DB:** `select * from notification_outbox;` and `notification_deliveries;` → 1 pending delivery.
4. **delivery-worker log:** POST to `http://localhost:3000/webhooks/geo` → `delivered`.
5. **webhook-server log:** signature verified → classified (`membership_request`) → persisted; email sent.
6. **webhook-server DB:** `select notification_type, email_sent_at from notifications;` → 1 row, `email_sent_at` set.
7. **MailerSend → Activity** (and the inbox): one email to `neo@wonderland.xyz`.

---

## Gotchas
- **Signature must match:** `app_webhooks.secret` (gaia DB) == `GEO_WEBHOOK_SECRET` (this server). Mismatch → 401, delivery retries.
- **Topic prefix:** producer topic and indexer `ENVIRONMENT` must agree (use `production` → no prefix → `space.governance`).
- **Two DBs:** don't point this server at `notifications_test` — it has its own schema in `geobrowser_notifications`.
- **MailerSend:** `MAILERSEND_FROM_EMAIL` must be on a **verified** domain or the send 4xxs (logged + skipped; in-app row still persists). The API key comes from `.env.local` (gitignored).
- **Recipient:** with `DEMO_FORCE_EMAIL` set, every notification emails that address — fine for the demo, remove for real runs.

## Stretch (closer to the full vision)
Replace step 5's direct producer with the real ingest path: run **kg-indexer**
on `knowledge.edits` to materialize the space/editors/entities, and produce the
governance event via **hermes** — then drop the DB seeding of `editors`/`spaces`.
Not needed for the single-email demo.
