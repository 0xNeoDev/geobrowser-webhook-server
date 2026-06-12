import { describe, expect, it } from "bun:test";
import { buildProposalUrl, emailContent } from "../src/delivery/copy";

const SPACE = "84a679ce-188f-061a-c9a9-2380bac2bab5";
const PROPOSAL = "1e801da2-3941-4969-8246-85e650421ec3";
const BASE = "https://www.geobrowser.io";

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

describe("emailContent — per notification type", () => {
	it("editorship_request → 'New editor request' + editor wording", () => {
		const { subject, text } = content({ notificationType: "editorship_request", spaceName: "Geo Genesis" });
		expect(subject).toBe("New editor request in Geo Genesis");
		expect(text).toContain("An editor request");
		expect(text).not.toContain("member request");
	});

	it("membership_request → 'New member request' + member wording", () => {
		const { subject, text } = content({ notificationType: "membership_request", spaceName: "Geo Genesis" });
		expect(subject).toBe("New member request in Geo Genesis");
		expect(text).toContain("A member request");
		expect(text).not.toContain("editor request");
	});

	it("new_proposal → 'New proposal' + proposal wording", () => {
		const { subject, text } = content({ notificationType: "new_proposal", spaceName: "Geo Genesis" });
		expect(subject).toBe("New proposal in Geo Genesis");
		expect(text).toContain("A new proposal");
	});

	it("unknown type falls back to the proposal wording", () => {
		expect(content({ notificationType: "something_else" }).subject).toBe("New proposal");
	});

	it("the three types produce distinct subjects", () => {
		const subj = (t: string) => content({ notificationType: t }).subject;
		expect(new Set([subj("editorship_request"), subj("membership_request"), subj("new_proposal")]).size).toBe(3);
	});
});

describe("emailContent — proposal link + names", () => {
	it("includes the proposal name when present", () => {
		expect(content({ proposalName: "Add Bob as editor" }).text).toContain('("Add Bob as editor")');
	});

	it("includes a Review-and-vote link to the proposal", () => {
		expect(content().text).toContain(
			"Review and vote: https://www.geobrowser.io/space/84a679ce188f061ac9a92380bac2bab5/governance?proposalId=1e801da239414969824685e650421ec3",
		);
	});

	it("omits the link when there is no proposalId", () => {
		const { text } = content({ proposalId: null });
		expect(text).not.toContain("/governance?proposalId=");
		expect(text).toContain("Open Geo Browser");
	});
});
