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
- `GET /health` — liveness.
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

Email delivery (MailerSend) and SNS push are subsequent/​deferred phases — see the plan.
