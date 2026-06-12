import { queryClient } from "../../src/db/client";

/** True only when a real DATABASE_URL was provided (set by test/setup.ts). */
export const RUN = process.env.RUN_INTEGRATION === "1";

/** Truncate all app tables for test isolation. */
export async function resetDb(): Promise<void> {
	await queryClient`truncate table notifications, users, notification_preferences`;
}

// Shared fixture IDs.
export const SPACE_ID = "20000000-0001-4000-8000-000000000001";
export const USER_SPACE_ID = "20000000-0002-4000-8000-000000000001";
export const PROPOSAL_ID = "20000000-0003-4000-8000-000000000001";
