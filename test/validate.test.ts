import { describe, expect, it } from "bun:test";
import { isUuid } from "../src/lib/validate";

describe("isUuid", () => {
	it("accepts canonical UUIDs (any case)", () => {
		expect(isUuid("20000000-0001-4000-8000-000000000001")).toBe(true);
		expect(isUuid("D4F5A6B7-1111-4222-8333-444455556666")).toBe(true);
	});

	it("rejects non-UUID strings and non-strings", () => {
		expect(isUuid("not-a-uuid")).toBe(false);
		expect(isUuid("20000000-0001-4000-8000")).toBe(false);
		expect(isUuid("")).toBe(false);
		expect(isUuid(undefined)).toBe(false);
		expect(isUuid(123)).toBe(false);
		expect(isUuid(null)).toBe(false);
	});
});
