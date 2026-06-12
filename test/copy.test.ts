import { describe, expect, it } from "bun:test";
import { buildProposalUrl, emailContent } from "../src/delivery/copy";

const SPACE = "84a679ce-188f-061a-c9a9-2380bac2bab5";
const PROPOSAL = "1e801da2-3941-4969-8246-85e650421ec3";
const BASE = "https://www.geobrowser.io";

// Shared defaults so each test only sets what it asserts.
function content(over: Partial<Parameters<typeof emailContent>[0]> = {}) {
	return emailContent({
		notificationType: "new_proposal",
		spaceName: null,
		proposalName: null,
		spaceId: SPACE,
		proposalId: PROPOSAL,
		baseUrl: BASE,
		...over,
	});
}

describe("buildProposalUrl", () => {
	it("produces the geobrowser governance URL with dash-less, lowercase IDs", () => {
		expect(buildProposalUrl(BASE, SPACE, PROPOSAL)).toBe(
			"https://www.geobrowser.io/space/84a679ce188f061ac9a92380bac2bab5/governance?proposalId=1e801da239414969824685e650421ec3",
		);
	});

	it("trims a trailing slash on the base URL", () => {
		expect(buildProposalUrl("https://www.geobrowser.io/", SPACE, PROPOSAL)).toContain(
			"https://www.geobrowser.io/space/",
		);
	});
});

describe("emailContent", () => {
	it("includes the space name and proposal name when present", () => {
		const { subject, text } = content({
			notificationType: "editorship_request",
			spaceName: "Geo Genesis",
			proposalName: "Add Bob as editor",
		});
		expect(subject).toBe("New editorship request in Geo Genesis");
		expect(text).toContain("editorship request");
		expect(text).toContain('("Add Bob as editor")');
		expect(text).toContain("in Geo Genesis");
	});

	it("includes a Review-and-vote link to the proposal", () => {
		const { text } = content();
		expect(text).toContain(
			"Review and vote: https://www.geobrowser.io/space/84a679ce188f061ac9a92380bac2bab5/governance?proposalId=1e801da239414969824685e650421ec3",
		);
	});

	it("omits the link when there is no proposalId", () => {
		const { text } = content({ proposalId: null });
		expect(text).not.toContain("/governance?proposalId=");
		expect(text).toContain("Open Geo Browser");
	});

	it("degrades gracefully when names are missing", () => {
		const { subject, text } = content({ notificationType: "membership_request" });
		expect(subject).toBe("New membership request");
		expect(text).not.toContain('("');
	});

	it("falls back to 'proposal' for an unknown type", () => {
		expect(content({ notificationType: "something_else" }).subject).toBe("New proposal");
	});
});
