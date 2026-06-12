import { describe, expect, it } from "bun:test";
import { isSupportedEventType, SUPPORTED_EVENT_TYPES } from "../src/webhook/types";

describe("SUPPORTED_EVENT_TYPES / isSupportedEventType", () => {
	it("supports proposal_created", () => {
		expect(isSupportedEventType("proposal_created")).toBe(true);
	});

	it("does not support other governance / bounty types", () => {
		for (const t of [
			"proposal_updated",
			"proposal_voted",
			"proposal_executed",
			"proposal_settings_updated",
			"proposal_rejected",
			"bounty_interest",
			"bounty_allocated",
			"bounty_payout",
			"something_unknown",
		]) {
			expect(isSupportedEventType(t)).toBe(false);
		}
	});

	it("is exactly the proposal_created set today", () => {
		expect([...SUPPORTED_EVENT_TYPES]).toEqual(["proposal_created"]);
	});
});
