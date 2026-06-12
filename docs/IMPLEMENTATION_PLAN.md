# Geo Browser App Server — Implementation Plan

> Status: **Draft** · Owner: Neo (eng) · Source of truth: [Notification delivery MVP PRD](https://app.notion.com/p/defi-wonderland/Notification-delivery-MVP-PRD-37b9a4c092c7809da784fc50aece8286)

The Geo Browser **app server** is the missing last mile of the Gaia notification
service. Gaia already produces per-editor webhook notifications (indexer →
outbox → delivery-worker); this server **receives** those webhooks, **persists**
them, and **delivers** them to Geo Browser users via an in-app feed/badge and
email.

This repo starts from the [`geo-webhook-server`](https://github.com/0xNeoDev/geo-webhook-server)
example (Bun + Hono signed-webhook receiver) and adds Postgres persistence,
identity, preferences, Privy-authenticated read/write APIs, and a
provider-abstracted delivery layer.

---

## 1. Scope (MVP)

**In:**
- Inbound **webhook receiver** for the Gaia delivery-worker (HMAC-SHA256 verify, dedupe, persist).
- The three MVP notification types — all derived from `proposal_created`, classified by the proposal's `actions`:
  - **Editorship request** (`actions` contains `add_editor`)
  - **Membership request** (`actions` contains `add_member`)
  - **New proposal** (any other proposal)
- **Identity store** (app server owns it): `privy_user_id` ↔ `user_space_id` ↔ `email`.
- **Per-channel preferences** (in-app, email) with a default.
- **Delivery channels:** **in-app** (persist → feed/badge) and **email** (MailerSend).
- **Read/write APIs** (Privy-authenticated): list notifications, unread count, mark read, mark all read, preferences, upsert user.
- **Privy server-side token verification** (net-new for the Geo stack).

**Out (explicitly deferred):**
- **AWS SNS / push delivery and device-token management** — not built now. The schema leaves room (see §5) but no registration/publish path is implemented this iteration.
- **Curator app** and any non–Geo-Browser front-end (each gets its own server later).
- Other GEO-2172 types (bounties, votes, comments, points, trending).
- Requester-facing outcome notifications ("your request was approved/rejected").
- Webhook self-registration API (the Geo Browser row is seeded manually into Gaia's `app_webhooks`).

---

## 2. Decisions & open questions (pending product — see PRD)

These came out of PRD review and gate some choices below. The plan picks a safe
default for each so we're not blocked; revisit when product answers.

| Topic | Plan default | Needs confirming |
|---|---|---|
| **Auth** | Front-end sends Privy token; server verifies + pulls email from Privy server-side. No new login step. | Confirm acceptable (FYI). |
| **In-app surface** | Badge (unread count) + Feed (recent notifications). | Is badge + feed enough for MVP? |
| **Default-on channels** | in-app **and** email default on for new users. | in-app + email, or just in-app? |
| **Classification/labeling** | `add_editor` → editorship; else `add_member` → membership; else new proposal; both → higher privilege (editor > member). | Confirm logic; product owns user-facing copy. |
| **Email rate limit** | Config knob `EMAIL_MAX_PER_RECIPIENT_PER_HOUR` (default off); design for it. | Do we rate-limit emails per recipient/hour? |
| **Proposal-executed → owner** | Not in MVP build; revisit. | Want it? (depends on indexer fan-out to the proposer.) |
| **Infra** | Containerized; co-locate with Geo Browser front-end. | Vercel or DO? (drives deploy target — see §9) |

---

## 3. Stack

- **Bun** + **Hono** — carried over from the example (fast TS runtime, minimal HTTP framework).
- **Postgres** — the app server's own database (notifications, identity, preferences, dedupe).
- **Drizzle ORM** + `drizzle-kit` migrations — matches gaia's migration conventions and gives typed queries.
- **`@privy-io/server-auth`** — server-side Privy access-token verification.
- **MailerSend SDK** — email channel.
- **Docker** — single-stage Bun image (from the example), extended with DB env.

> Note: the example also ships `wrangler.toml` (Cloudflare Workers). We are **not** targeting Workers — this server needs a persistent Postgres connection and an always-on listener, so it runs as a container (see §9). The `wrangler` bits will be dropped.

---

## 4. Architecture

```
Gaia delivery-worker ──POST /webhooks/geo (X-Geo-Signature)──▶ Webhook receiver
                                                                  │ verify → dedupe → classify
                                                                  ▼
                                                            App Postgres
                                                   (users · notifications · prefs · dedupe)
                                                                  │
                                                  ┌───────────────┴───────────────┐
                                          in-app (persist)                  email (MailerSend, if enabled)
                                                  │
   Geo Browser UI ◀──Bearer Privy token──▶ Read/Write APIs ──reads feed/badge, prefs, upserts identity
```

- **In-app is a pull channel:** the notification is persisted; the UI fetches it via the API. (Email is the only true outbound channel in the MVP.)
- **Push** would be the second outbound channel — deferred.

---

## 5. Data model (MVP)

```
users
  id              uuid pk
  privy_user_id   text unique not null     -- from verified token (sub)
  user_space_id   uuid unique not null     -- personal space; webhook target
  email           text                     -- resolved server-side from Privy
  created_at, updated_at

notifications
  id               uuid pk
  user_space_id    uuid not null            -- recipient (an editor)
  event_type       text not null            -- "proposal_created" (MVP)
  notification_type text not null           -- editorship_request | membership_request | new_proposal
  space_id         uuid not null
  space_name       text
  proposal_id      uuid
  proposal_name    text
  proposer_id      uuid
  proposer_name    text
  payload          jsonb not null           -- raw webhook body (forward-compat)
  idempotency_key  text unique not null
  read_at          timestamptz              -- null = unread
  created_at       timestamptz not null
  index (user_space_id, created_at desc)
  index (user_space_id) where read_at is null   -- unread-count

notification_preferences
  user_space_id  uuid pk
  in_app_enabled boolean not null default true
  email_enabled  boolean not null default true
  -- push_enabled reserved for later; not surfaced this iteration
  updated_at

processed_webhooks            -- DB-backed idempotency (replaces in-memory store)
  idempotency_key text pk
  processed_at     timestamptz not null
```

**Deferred (not created this iteration):** `device_tokens (user_space_id, token, platform, …)` for SNS push. Mentioned for future compatibility per the PRD; **not built now**.

---

## 6. Webhook receiver (inbound, not Privy-authed)

Adapt the example's `POST /webhooks/geo`:
1. Verify `X-Geo-Signature: sha256=<hex>` HMAC-SHA256 over the raw body with the shared secret (`GEO_WEBHOOK_SECRET`). Constant-time compare. (Example's `signature.ts` is reusable as-is.)
2. Enforce body size cap; parse JSON.
3. Require `idempotency_key`; **dedupe via `processed_webhooks`** (insert-or-409). Replaces the example's in-memory `IdempotencyStore`.
4. **Filter to MVP scope:** only `event_type === "proposal_created"` produces a notification this iteration. Other event types are **acked (2xx) and ignored** (so the delivery-worker doesn't retry), not persisted.
5. **Classify** from `actions[]` (the indexer always includes it on `proposal_created`):
   - contains `add_editor` → `editorship_request`
   - else contains `add_member` → `membership_request`
   - else → `new_proposal`
6. **Resolve recipient:** look up `user_space_id` in `users`. If unknown (user never signed in / upserted), persist anyway keyed by `user_space_id` so it surfaces when they register, **or** drop — decision below. *Plan: persist regardless; the feed query is by `user_space_id`.*
7. **Persist** the notification, then **fan out** to enabled channels: in-app is already satisfied by the row; if `email_enabled` (and rate limit allows), send via MailerSend.
8. Return `2xx`.

> Payload contract: `notification-service/WEBHOOK_INTEGRATION.md` (gaia). `proposal_created` carries `space_id`, `space_name`, `user_space_id`, `idempotency_key`, `proposal_id`, `proposal_name`, `proposer_id/name`, `voting_mode`, `actions[]`, `settings`.

---

## 7. Authenticated APIs (Privy Bearer)

Middleware verifies the Privy access token (`@privy-io/server-auth` + `PRIVY_APP_ID`/`PRIVY_APP_SECRET`), extracts `privy_user_id` (sub), resolves `user_space_id` via `users`. **Acting user is always derived from the token, never the request body.**

| Method/Path | Purpose |
|---|---|
| `GET /notifications` | user's notifications, newest first, limit 100 |
| `GET /notifications/unread-count` | unread count (badge) |
| `POST /notifications/mark-read` | mark one-or-many read (ids[]) |
| `POST /notifications/mark-all-read` | mark all read |
| `GET /preferences` / `PUT /preferences` | read/update per-channel toggles |
| `POST /users` | upsert identity: body `{user_space_id}`; `privy_user_id` + `email` derived from verified token (email via `getUserById`) |
| `GET /health` | liveness (unauthenticated) |

**Deferred:** `POST/DELETE /push-tokens` (SNS device tokens) — not this iteration.

---

## 8. Delivery: provider abstraction

```ts
interface NotificationChannel {
  readonly name: "in_app" | "email";   // "push" added later
  deliver(notification, recipient): Promise<void>;
}
```
- **in_app** — no-op beyond persistence (the row is the delivery).
- **email** — MailerSend; recipient = the Privy-verified email stored at upsert. Gated by `email_enabled` and the optional per-recipient/hour rate limit.
- **push** — interface reserved; **no implementation** this iteration.

---

## 9. Infra / deploy (pending §2 answer)

- Containerized (Bun single-stage image from the example).
- Needs a persistent Postgres + an always-on listener → **not** a natural fit for Vercel serverless. If Geo Browser is on **DigitalOcean**, co-locate as a DOKS deployment + managed Postgres (mirrors gaia's pattern). If on **Vercel**, we still likely run the server as a container elsewhere (DO/Fly/Render) with managed Postgres, and only the front-end stays on Vercel.
- **Pull secret / registry, CI, and k8s manifests** to be decided once the host is confirmed.

---

## 10. Milestones

- **Phase 0 — Scaffold.** ✅ Done. Bun + Hono, dropped Cloudflare/Discord, config/env, `/health`, Dockerfile, CI (typecheck + lint + test).
- **Phase 1 — DB.** ✅ Done. Drizzle schema + generated migration for the four MVP tables (§5); pooled `postgres-js` client.
- **Phase 2 — Webhook receiver.** ✅ Done. Signature verify, DB-backed dedupe (transactional), `proposal_created` classification, persist. Unit tests for signature + classification (9 passing); DB-touching path is typechecked (integration test needs a Postgres, follow-up).
- **Phase 3 — Privy auth.** ✅ Done. `@privy-io/server-auth` token verification; `requirePrivyAuth` (token → `privyUserId`) + `requireUser` (→ `userSpaceId`) middleware.
- **Phase 4 — Read/write APIs.** ✅ Done. `POST /users` (upsert, email derived from Privy), `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/mark-read`, `POST /notifications/mark-all-read`, `GET/PUT /preferences`.
- **Phase 5 — Email.** ✅ Done. MailerSend channel (REST), `email_enabled` gating, recipient email from Privy, optional per-recipient/hour rate limit (`EMAIL_MAX_PER_RECIPIENT_PER_HOUR`, default off), wired into the webhook fan-out after commit. `email_sent_at` column tracks delivery. Email is optional — unset MailerSend env = in-app-only.
- **CI + integration tests.** ✅ Done. Two GitHub Actions workflows — **Checks** (lint + typecheck + build) and **Tests** (unit + integration against a Postgres service). Integration tests (`test/integration/*`) cover webhook ingest → persist/dedupe/classify, the repo layer (identity, feed, unread, preferences), and email delivery (injected sender: gating, recipient resolution, hourly rate limit); they self-skip without a `DATABASE_URL`.
- **Route-level e2e.** ✅ Done. An `AuthProvider` seam (`setAuthProvider`) lets tests mock Privy and drive the real Hono app + DB: auth gating (401/403), upsert, notification scoping, unread/mark-read/mark-all-read, preferences, and validation (400s).
- **Phase 6 — Deploy.** ✅ Done. Decision: **DOKS** (shared Geo cluster, not Vercel — the front-end is on Vercel but this is an always-on service + Postgres). `k8s/` manifests (namespace, deployment, service, nginx ingress + cert-manager TLS) modeled on `geo-chat-api`; backed by the shared managed Postgres (`app-db`, formerly `chat-db`); migrations via a `migrate` initContainer; `geo` pull secret; `.github/workflows/deploy.yml` (build → DOCR → apply → rollout). First-deploy steps in `k8s/README.md`.
- **Deferred:** SNS push + device tokens, curator app, proposal-executed-to-owner, other notification types.

---

## 11. Reference

- PRD: [Notification delivery MVP PRD](https://app.notion.com/p/defi-wonderland/Notification-delivery-MVP-PRD-37b9a4c092c7809da784fc50aece8286)
- Webhook contract: `gaia:notification-service/WEBHOOK_INTEGRATION.md`
- Event/payload types: `gaia:notification-service/notification-indexer/src/models.rs`
- Starting skeleton: [`geo-webhook-server`](https://github.com/0xNeoDev/geo-webhook-server)
