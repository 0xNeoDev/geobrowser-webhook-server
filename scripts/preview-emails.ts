// Local email-design preview. Renders all three notification types using the
// real notificationCopy + emailHtml, and serves the brand Calibre fonts from
// geogenesis so the preview matches Geo Browser.
//
//   bun run scripts/preview-emails.ts   →   http://localhost:4000
//
// Preview-only; not part of the server build.
import { existsSync } from "node:fs";
import { buildProposalUrl, notificationCopy } from "../src/delivery/copy";
import { emailHtml } from "../src/delivery/email-html";

const PORT = 4000;
const FONTS_DIR = "/Users/johns/wonderland/geobrowser/geogenesis/apps/web/app/fonts";

const SPACE = "Crypto";
const SPACE_ID = "84a679ce-188f-061a-c9a9-2380bac2bab5";
const PROPOSAL_ID = "1e801da2-3941-4969-8246-85e650421ec3";
const BASE = "https://www.geobrowser.io";

const SAMPLES = [
	{ type: "editorship_request", proposalName: "Add Yaniv as an editor" },
	{ type: "membership_request", proposalName: "Add Preston as a member" },
	{ type: "new_proposal", proposalName: "Update the space description" },
];

const SPACE_HEX = SPACE_ID.replace(/-/g, "");

function renderEmail(sample: { type: string; proposalName: string }): string {
	const { title, body } = notificationCopy({
		notificationType: sample.type,
		spaceName: SPACE,
		proposalName: sample.proposalName,
	});
	return emailHtml({
		title,
		body,
		url: buildProposalUrl(BASE, SPACE_ID, PROPOSAL_ID),
		spaceName: SPACE,
		unsubscribeSpaceUrl: `${BASE}/settings/notifications?space=${SPACE_HEX}`,
		unsubscribeAllUrl: `${BASE}/settings/notifications`,
	});
}

function page(): string {
	const cards = SAMPLES.map((s) => {
		const srcdoc = renderEmail(s).replace(/"/g, "&quot;");
		return `<section><h2>${s.type}</h2><iframe srcdoc="${srcdoc}"></iframe></section>`;
	}).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><title>Geo notification email preview</title>
<style>
 body{margin:0;background:#eef0f2;font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#202020;}
 header{padding:20px 24px;background:#fff;border-bottom:1px solid #e3e3e3;}
 header h1{margin:0;font-size:16px;font-weight:600;}
 header p{margin:4px 0 0;color:#888;font-size:13px;}
 section{max-width:640px;margin:24px auto;}
 section h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:0 0 8px 4px;}
 iframe{width:100%;height:440px;border:0;border-radius:12px;background:#fbfbfb;box-shadow:0 1px 5px rgba(0,0,0,.07);}
</style></head>
<body>
<header><h1>Geo notification email preview</h1><p>Brand font (Calibre) + colors — the three notification types.</p></header>
${cards}
</body></html>`;
}

Bun.serve({
	port: PORT,
	fetch(req) {
		const { pathname } = new URL(req.url);
		if (pathname.startsWith("/fonts/")) {
			const name = pathname.slice("/fonts/".length);
			if (!/^calibre-(regular|medium|semibold|bold)\.woff2$/.test(name) || !existsSync(`${FONTS_DIR}/${name}`)) {
				return new Response("not found", { status: 404 });
			}
			return new Response(Bun.file(`${FONTS_DIR}/${name}`), { headers: { "content-type": "font/woff2" } });
		}
		return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8" } });
	},
});

console.log(`Geo email preview → http://localhost:${PORT}`);
