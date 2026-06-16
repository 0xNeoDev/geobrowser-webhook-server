// One-off: send a single HTML notification email via MailerSend (to view the
// design in a real inbox). Preview/test helper — not part of the server.
//   bun run scripts/send-test-email.ts
import { buildProposalUrl, emailContent, notificationCopy } from "../src/delivery/copy";
import { emailHtml } from "../src/delivery/email-html";

const API_KEY = process.env.MAILERSEND_API_KEY; // auto-loaded from .env.local by bun
const FROM = process.env.MAILERSEND_FROM_EMAIL ?? "notifications@geobrowser.io";
const TO = "neo@wonderland.xyz";

const SPACE = "Geo Genesis";
const SPACE_ID = "84a679ce-188f-061a-c9a9-2380bac2bab5";
const PROPOSAL_ID = "1e801da2-3941-4969-8246-85e650421ec3";
const BASE = "https://www.geobrowser.io";
const SPACE_HEX = SPACE_ID.replace(/-/g, "");

if (!API_KEY) {
	console.error("MAILERSEND_API_KEY not set (expected in .env.local)");
	process.exit(1);
}

const sample = { notificationType: "editorship_request", spaceName: SPACE, proposalName: "Add Yaniv as an editor" };
const { title, body } = notificationCopy(sample);
const url = buildProposalUrl(BASE, SPACE_ID, PROPOSAL_ID);
const { subject, text } = emailContent({ ...sample, spaceId: SPACE_ID, proposalId: PROPOSAL_ID, baseUrl: BASE });
const html = emailHtml({
	title,
	body,
	url,
	spaceName: SPACE,
	unsubscribeSpaceUrl: `${BASE}/settings/notifications?space=${SPACE_HEX}`,
	unsubscribeAllUrl: `${BASE}/settings/notifications`,
});

const res = await fetch("https://api.mailersend.com/v1/email", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${API_KEY}`,
		"Content-Type": "application/json",
		"X-Requested-With": "XMLHttpRequest",
	},
	body: JSON.stringify({ from: { email: FROM, name: "Geo" }, to: [{ email: TO }], subject, text, html }),
});

console.log(`MailerSend → HTTP ${res.status} ${res.statusText}`);
if (!res.ok) {
	console.log(await res.text());
	process.exit(1);
}
console.log(`Sent HTML "${subject}" to ${TO} (from ${FROM})`);
