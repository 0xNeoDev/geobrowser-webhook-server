ALTER TABLE "notifications" ALTER COLUMN "email_status" SET DEFAULT 'pending';--> statement-breakpoint
UPDATE "notifications" SET "email_status" = 'pending' WHERE "email_status" IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "email_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_next_retry_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_email_pending_idx" ON "notifications" USING btree ("email_next_retry_at") WHERE "notifications"."email_status" = 'pending';