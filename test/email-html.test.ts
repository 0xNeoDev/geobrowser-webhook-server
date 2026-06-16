import { describe, expect, it } from "bun:test";
import { emailHtml } from "../src/delivery/email-html";

const BASE = {
	title: "New editor request in Crypto",
	body: 'An editor request "Add Bob" is awaiting your vote in Crypto.',
	url: "https://www.geobrowser.io/space/abc/governance?proposalId=def",
	spaceName: "Crypto",
	unsubscribeSpaceUrl: "https://www.geobrowser.io/settings/notifications?space=abc",
	unsubscribeAllUrl: "https://www.geobrowser.io/settings/notifications",
};

describe("emailHtml", () => {
	it("is a complete HTML document", () => {
		const html = emailHtml(BASE);
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain("</html>");
	});

	it("renders the title and body (body quotes HTML-escaped)", () => {
		const html = emailHtml(BASE);
		expect(html).toContain(BASE.title);
		expect(html).toContain("An editor request &quot;Add Bob&quot; is awaiting your vote in Crypto.");
	});

	it("renders a CTA anchor to the proposal when a url is given", () => {
		const html = emailHtml(BASE);
		expect(html).toContain(`href="${BASE.url}"`);
		expect(html).toContain("Review and vote");
	});

	it("falls back to plain copy (no anchor) when url is null", () => {
		const html = emailHtml({ ...BASE, url: null });
		expect(html).not.toContain('href="https://www.geobrowser.io/space/');
		expect(html).toContain("Open Geo Browser to review and vote.");
	});

	it("includes both unsubscribe links with the space label", () => {
		const html = emailHtml(BASE);
		expect(html).toContain(`href="${BASE.unsubscribeSpaceUrl}"`);
		expect(html).toContain(`href="${BASE.unsubscribeAllUrl}"`);
		expect(html).toContain("Crypto"); // space label in footer + header line
	});

	it("uses a generic space label when spaceName is null", () => {
		const html = emailHtml({ ...BASE, spaceName: null });
		expect(html).toContain("this space");
	});

	it("escapes HTML in interpolated values (no injection)", () => {
		const html = emailHtml({
			...BASE,
			title: 'Title <script>alert("x")</script>',
			spaceName: 'A & B <">',
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("A &amp; B");
	});
});
