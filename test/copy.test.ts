import { describe, expect, it } from "bun:test";
import { emailContent } from "../src/delivery/copy";

describe("emailContent", () => {
	it("includes the space name and proposal name when present", () => {
		const { subject, text } = emailContent({
			notificationType: "editorship_request",
			spaceName: "Geo Genesis",
			proposalName: "Add Bob as editor",
		});
		expect(subject).toBe("New editorship request in Geo Genesis");
		expect(text).toContain("editorship request");
		expect(text).toContain('("Add Bob as editor")');
		expect(text).toContain("in Geo Genesis");
	});

	it("degrades gracefully when names are missing", () => {
		const { subject, text } = emailContent({
			notificationType: "membership_request",
			spaceName: null,
			proposalName: null,
		});
		expect(subject).toBe("New membership request");
		expect(text).toContain("membership request");
		expect(text).not.toContain('("');
	});

	it("maps new_proposal to a neutral label", () => {
		expect(emailContent({ notificationType: "new_proposal", spaceName: null, proposalName: null }).subject).toBe(
			"New proposal",
		);
	});

	it("falls back to 'proposal' for an unknown type", () => {
		expect(emailContent({ notificationType: "something_else", spaceName: null, proposalName: null }).subject).toBe(
			"New proposal",
		);
	});
});
