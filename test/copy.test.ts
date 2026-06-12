import { describe, expect, it } from "bun:test";
import { buildProposalUrl, emailContent, notificationCopy } from "../src/delivery/copy";

const SPACE_ID = "84a679ce-188f-061a-c9a9-2380bac2bab5";
const PROPOSAL_ID = "1e801da2-3941-4969-8246-85e650421ec3";
const URL =
	"https://www.geobrowser.io/space/84a679ce188f061ac9a92380bac2bab5/governance?proposalId=1e801da239414969824685e650421ec3";
const BASE = "https://www.geobrowser.io";
const SPACE = "Geo Genesis";
const PROP = "Add Bob";

describe("buildProposalUrl", () => {
	it("produces the geobrowser governance URL with dash-less, lowercase IDs", () => {
		expect(buildProposalUrl(BASE, SPACE_ID, PROPOSAL_ID)).toBe(URL);
	});

	it("trims a trailing slash on the base URL", () => {
		expect(buildProposalUrl("https://www.geobrowser.io/", SPACE_ID, PROPOSAL_ID)).toBe(URL);
	});
});

// Exhaustive matrix: every (type × spaceName × proposalName) → exact title + body.
// title depends on (type, space); body depends on (type, space, proposalName).
const COPY_CASES: Array<{
	notificationType: string;
	spaceName: string | null;
	proposalName: string | null;
	title: string;
	body: string;
}> = [
	// editorship_request
	{
		notificationType: "editorship_request",
		spaceName: null,
		proposalName: null,
		title: "New editor request",
		body: "An editor request is awaiting your vote.",
	},
	{
		notificationType: "editorship_request",
		spaceName: SPACE,
		proposalName: null,
		title: "New editor request in Geo Genesis",
		body: "An editor request is awaiting your vote in Geo Genesis.",
	},
	{
		notificationType: "editorship_request",
		spaceName: null,
		proposalName: PROP,
		title: "New editor request",
		body: 'An editor request ("Add Bob") is awaiting your vote.',
	},
	{
		notificationType: "editorship_request",
		spaceName: SPACE,
		proposalName: PROP,
		title: "New editor request in Geo Genesis",
		body: 'An editor request ("Add Bob") is awaiting your vote in Geo Genesis.',
	},
	// membership_request
	{
		notificationType: "membership_request",
		spaceName: null,
		proposalName: null,
		title: "New member request",
		body: "A member request is awaiting your vote.",
	},
	{
		notificationType: "membership_request",
		spaceName: SPACE,
		proposalName: null,
		title: "New member request in Geo Genesis",
		body: "A member request is awaiting your vote in Geo Genesis.",
	},
	{
		notificationType: "membership_request",
		spaceName: null,
		proposalName: PROP,
		title: "New member request",
		body: 'A member request ("Add Bob") is awaiting your vote.',
	},
	{
		notificationType: "membership_request",
		spaceName: SPACE,
		proposalName: PROP,
		title: "New member request in Geo Genesis",
		body: 'A member request ("Add Bob") is awaiting your vote in Geo Genesis.',
	},
	// new_proposal
	{
		notificationType: "new_proposal",
		spaceName: null,
		proposalName: null,
		title: "New proposal",
		body: "A new proposal is awaiting your vote.",
	},
	{
		notificationType: "new_proposal",
		spaceName: SPACE,
		proposalName: null,
		title: "New proposal in Geo Genesis",
		body: "A new proposal is awaiting your vote in Geo Genesis.",
	},
	{
		notificationType: "new_proposal",
		spaceName: null,
		proposalName: PROP,
		title: "New proposal",
		body: 'A new proposal ("Add Bob") is awaiting your vote.',
	},
	{
		notificationType: "new_proposal",
		spaceName: SPACE,
		proposalName: PROP,
		title: "New proposal in Geo Genesis",
		body: 'A new proposal ("Add Bob") is awaiting your vote in Geo Genesis.',
	},
	// unknown type → falls back to proposal copy
	{
		notificationType: "proposal_voted",
		spaceName: null,
		proposalName: null,
		title: "New proposal",
		body: "A new proposal is awaiting your vote.",
	},
	{
		notificationType: "something_else",
		spaceName: SPACE,
		proposalName: PROP,
		title: "New proposal in Geo Genesis",
		body: 'A new proposal ("Add Bob") is awaiting your vote in Geo Genesis.',
	},
];

describe("notificationCopy — exact output for every combination", () => {
	for (const c of COPY_CASES) {
		it(`${c.notificationType} | space=${c.spaceName ?? "∅"} | prop=${c.proposalName ?? "∅"}`, () => {
			const out = notificationCopy(c);
			expect(out.title).toBe(c.title);
			expect(out.body).toBe(c.body);
		});
	}
});

describe("emailContent — exact subject/text (built on notificationCopy + link)", () => {
	it("subject equals the notificationCopy title", () => {
		for (const c of COPY_CASES) {
			expect(emailContent({ ...c, spaceId: SPACE_ID, proposalId: PROPOSAL_ID, baseUrl: BASE }).subject).toBe(c.title);
		}
	});

	it("with a proposalId, text = body + the review link", () => {
		const c = COPY_CASES[3]; // editorship + space + prop
		expect(emailContent({ ...c, spaceId: SPACE_ID, proposalId: PROPOSAL_ID, baseUrl: BASE }).text).toBe(
			`${c.body}\n\nReview and vote: ${URL}`,
		);
	});

	it("without a proposalId, text = body + the fallback line (no link)", () => {
		const c = COPY_CASES[0]; // editorship, no space/prop
		expect(emailContent({ ...c, spaceId: SPACE_ID, proposalId: null, baseUrl: BASE }).text).toBe(
			`${c.body} Open Geo Browser to review and vote.`,
		);
	});
});
