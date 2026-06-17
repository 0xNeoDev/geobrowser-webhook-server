import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Identity store — the app server owns this (Geo has no identity service).
 * Populated by the front-end's upsert on sign-up/login. `user_space_id` is the
 * personal space a webhook is addressed to.
 */
export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	privyUserId: text("privy_user_id").notNull().unique(),
	userSpaceId: uuid("user_space_id").notNull().unique(),
	email: text("email"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Persisted notifications (the in-app feed + badge are reads over this table).
 * Not FK-bound to `users`: a notification can arrive before its recipient has
 * ever signed in, so it is keyed by `user_space_id` and surfaces once they upsert.
 */
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userSpaceId: uuid("user_space_id").notNull(),
		eventType: text("event_type").notNull(), // "proposal_created" (MVP)
		notificationType: text("notification_type").notNull(), // editorship_request | membership_request | new_proposal
		spaceId: uuid("space_id").notNull(),
		spaceName: text("space_name"),
		proposalId: uuid("proposal_id"),
		proposalName: text("proposal_name"),
		proposerId: uuid("proposer_id"),
		proposerName: text("proposer_name"),
		payload: jsonb("payload").notNull(), // raw webhook body (forward-compat)
		idempotencyKey: text("idempotency_key").notNull().unique(),
		readAt: timestamp("read_at", { withTimezone: true }),
		emailSentAt: timestamp("email_sent_at", { withTimezone: true }), // set only when an email actually went out
		// Email-delivery outcome / queue state for this notification. The email worker
		// claims rows in `pending`, then sets a terminal state:
		//   pending (default, awaiting the worker) | sent | failed | skipped_stale
		//   | skipped_ratelimited | disabled | no_recipient | unconfigured
		emailStatus: text("email_status").notNull().default("pending"),
		// Email retry bookkeeping (durable outbox): how many send attempts so far, and
		// the earliest time the worker may (re)claim this row. null = claimable now.
		emailAttempts: integer("email_attempts").notNull().default(0),
		emailNextRetryAt: timestamp("email_next_retry_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		// Feed: newest-first per recipient.
		index("notifications_user_created_idx").on(t.userSpaceId, t.createdAt.desc()),
		// Unread count (badge): partial index over unread rows only.
		index("notifications_user_unread_idx").on(t.userSpaceId).where(sql`${t.readAt} is null`),
		// Email worker poll: due pending rows, oldest first. Partial → tiny once drained.
		index("notifications_email_pending_idx").on(t.emailNextRetryAt).where(sql`${t.emailStatus} = 'pending'`),
	],
);

/** Per-user, per-channel delivery preferences. All default on (PRD). */
export const notificationPreferences = pgTable("notification_preferences", {
	userSpaceId: uuid("user_space_id").primaryKey(),
	inAppEnabled: boolean("in_app_enabled").notNull().default(true),
	emailEnabled: boolean("email_enabled").notNull().default(true),
	// push_enabled is intentionally omitted this iteration (SNS deferred).
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Dedup note: we only persist supported events (proposal_created), and
// `notifications.idempotency_key` is UNIQUE — so inbound dedup (incl. delivery-
// worker retries) is enforced by that constraint. Unsupported events are acked
// and dropped without any write, so no separate idempotency ledger is needed.
