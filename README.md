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
- `POST /users` — upsert identity (`{ user_space_id }`; `privy_user_id` + email derived from the verified token).
- `GET /notifications` — newest-first, limit 100.
- `GET /notifications/unread-count` — `{ unread }` for the badge.
- `POST /notifications/mark-read` — `{ ids: string[] }`.
- `POST /notifications/mark-all-read`.
- `GET /preferences` / `PUT /preferences` — per-channel toggles (`in_app_enabled`, `email_enabled`).

## Delivery channels

- **In-app** — the persisted notification *is* the delivery (read via the APIs above).
- **Email** — MailerSend, sent on ingest when the recipient's `email_enabled` is on and they have a Privy-linked email. Optional: with `MAILERSEND_API_KEY` unset the channel is disabled (in-app only). `EMAIL_ENABLED=false` is a global kill-switch that stops all outbound email (in-app still works) without removing credentials. An optional `EMAIL_MAX_PER_RECIPIENT_PER_HOUR` cap (default `0` = off) prevents flooding.
- **Push (SNS)** — deferred.

SNS push and the curator app remain out of scope — see the plan.
