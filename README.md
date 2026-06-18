# geobrowser-webhook-server

The Geo Browser **app server**: the last mile of the Gaia notification service.
It receives signed webhooks from the Gaia delivery-worker, persists notifications,
and (in later phases) serves them to Geo Browser users via an in-app feed/badge
and email.

See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for the full plan
and the [Notifications MVP PRD](https://app.notion.com/p/defi-wonderland/Notification-delivery-MVP-PRD-37b9a4c092c7809da784fc50aece8286).

## Stack

- **Bun** — TypeScript runtime
- **Hono** — HTTP framework
- **Postgres** + **Drizzle ORM** — persistence and migrations
- **Docker** — containerized deploy

## Quick start

```bash
bun install
cp .env.example .env        # set DATABASE_URL + GEO_WEBHOOK_SECRET
bun run db:migrate          # apply migrations
bun run dev                 # hot reload (or: bun run start)
```

## Scripts

| Script | Purpose |
|---|---|
| `bun run dev` / `start` | run the server (watch / plain) |
| `bun test` | unit tests |
| `bun run check` | typecheck (`tsc --noEmit`) |
| `bun run lint` | Biome lint/format check |
| `bun run db:generate` | generate a migration from `src/db/schema.ts` |
| `bun run db:migrate` | apply migrations |

## Endpoints (current)

**Public**
- `GET /health` — liveness (process up; no dependencies checked).
- `GET /ready` — readiness; `200` when the DB is reachable, else `503`. The k8s readiness probe uses this so traffic isn't routed to a pod that can't reach Postgres.
- `POST /webhooks/geo` — inbound webhook. Verifies `X-Geo-Signature` (HMAC-SHA256
  over the raw body with `GEO_WEBHOOK_SECRET`), dedupes by `idempotency_key`, and
  for `proposal_created` classifies (editorship / membership / new proposal) and
  persists. Other event types are acknowledged and ignored.

**Authenticated** (`Authorization: Bearer <Privy access token>`)

> **Front-end auth:** send the user's Privy **access token** as the `Authorization: Bearer` header. Obtain it client-side from the Privy SDK (`getAccessToken()`); it's a short-lived JWT. The server verifies it with `@privy-io/server-auth`, derives `privy_user_id` + email from the token, and resolves the local `user_space_id` — so call `POST /users` once on login to register before the other endpoints. See Privy's [access tokens guide](https://docs.privy.io/authentication/user-authentication/access-tokens). Set `PRIVY_VERIFICATION_KEY` (the app's public ES256 key) to verify tokens **offline** — keeping `PRIVY_APP_SECRET` off the per-request path (it's then used only for the email lookup at registration).

- `POST /users` — upsert identity (`{ user_space_id }`; `privy_user_id` + email derived from the verified token).
- `GET /notifications` — newest-first, limit 100.
- `GET /notifications/unread-count` — `{ unread }` for the badge.
- `POST /notifications/mark-read` — `{ ids: string[] }`.
- `POST /notifications/mark-all-read`.
- `GET /preferences` / `PUT /preferences` — per-channel toggles (`in_app_enabled`, `email_enabled`).

## Delivery channels

- **In-app** — the persisted notification *is* the delivery (read via the APIs above). This is the durable channel; the webhook is acked as soon as the row is committed.
- **Email** — MailerSend, delivered **asynchronously by the email outbox worker**, decoupled from the webhook ack. Each notification is persisted `email_status='pending'` and the worker (every `EMAIL_WORKER_POLL_MS`) claims due rows (`FOR UPDATE SKIP LOCKED`, safe across replicas), sends when the recipient's `email_enabled` is on and they have a Privy-linked email, and **retries durably** with exponential backoff up to `EMAIL_MAX_ATTEMPTS` before marking `email_status='failed'` — so a MailerSend outage doesn't lose mail (it flushes on recovery). `sendEmail` also does a few quick in-process retries for momentary blips. Channel is disabled if `MAILERSEND_API_KEY` is unset (in-app only) or `EMAIL_ENABLED=false` (kill-switch). `EMAIL_MAX_PER_RECIPIENT_PER_HOUR` (default `0` = off) caps flooding; `STALE_THRESHOLD_DAYS` (default `5`; `0` = off) skips events older than the cap. The per-notification outcome is recorded in `email_status` (`pending | sent | failed | skipped_stale | skipped_ratelimited | disabled | no_recipient | unconfigured`).
- **Push (SNS)** — deferred.

SNS push and the curator app remain out of scope — see the plan.
