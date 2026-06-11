import { describe, expect, it } from "bun:test";
import { classifyProposal } from "../src/webhook/classify";

describe("classifyProposal", () => {
	it("labels add_editor as editorship_request", () => {
		expect(classifyProposal([{ type: "add_editor", target_address: "0x1" }])).toBe("editorship_request");
	});

	it("labels add_member as membership_request", () => {
		expect(classifyProposal([{ type: "add_member", target_address: "0x1" }])).toBe("membership_request");
	});

	it("labels anything else as new_proposal", () => {
		expect(classifyProposal([{ type: "publish", target_address: null }])).toBe("new_proposal");
	});

	it("labels a proposal with both by the higher-privilege action (editor > member)", () => {
		expect(classifyProposal([{ type: "add_member" }, { type: "add_editor" }])).toBe("editorship_request");
	});

	it("falls back to new_proposal for empty or missing actions", () => {
		expect(classifyProposal([])).toBe("new_proposal");
		expect(classifyProposal(null)).toBe("new_proposal");
		expect(classifyProposal(undefined)).toBe("new_proposal");
	});
});
