// HTML rendering of a notification email, styled to match Geo Browser
// (geogenesis): Calibre font + brand palette (text #202020, primary #3963fe,
// bg #fbfbfb, dividers #f0f0f0, muted #606060/#b6b6b6).
//
// Table-based + inline styles for email-client robustness. The @font-face uses
// a relative /fonts path that resolves in the local preview; email clients that
// can't load it fall back to the Helvetica/Arial stack.

const FONT = "'Calibre','Helvetica Neue',Helvetica,Arial,sans-serif";

// Geo logo — a hosted PNG, NOT inline SVG: Gmail (and most webmail) strip inline
// <svg>, so the mark only renders reliably as a real https <img>. Served from the
// geobrowser.io public assets. `alt="Geo"` covers the images-off / blocked case.
const GEO_LOGO = `<img src="https://www.geobrowser.io/static/favicon-64x64.png" width="26" height="26" alt="Geo" style="vertical-align:middle;border:0;display:inline-block;border-radius:6px;">`;

/** Escape text for safe interpolation into HTML element content / attributes. */
function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function emailHtml(input: {
	title: string;
	body: string;
	url: string | null;
	spaceName: string | null;
	unsubscribeSpaceUrl: string;
	unsubscribeAllUrl: string;
}): string {
	const title = esc(input.title);
	const body = esc(input.body);
	const cta = input.url
		? `<a href="${esc(input.url)}" style="display:inline-block;background:#3963fe;color:#ffffff;font-family:${FONT};font-weight:600;font-size:15px;line-height:1;text-decoration:none;padding:13px 22px;border-radius:10px;">Review and vote</a>`
		: `<span style="font-family:${FONT};font-size:15px;color:#606060;">Open Geo Browser to review and vote.</span>`;
	const footerSpace = input.spaceName ? ` of <strong style="color:#606060;">${esc(input.spaceName)}</strong>` : "";
	const spaceLabel = input.spaceName ? esc(input.spaceName) : "this space";
	const unsubLinkStyle = "color:#8b8b8b;text-decoration:underline;";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<style>
@font-face{font-family:'Calibre';font-weight:400;font-style:normal;font-display:swap;src:url('/fonts/calibre-regular.woff2') format('woff2');}
@font-face{font-family:'Calibre';font-weight:500;font-style:normal;font-display:swap;src:url('/fonts/calibre-medium.woff2') format('woff2');}
@font-face{font-family:'Calibre';font-weight:600;font-style:normal;font-display:swap;src:url('/fonts/calibre-semibold.woff2') format('woff2');}
@font-face{font-family:'Calibre';font-weight:700;font-style:normal;font-display:swap;src:url('/fonts/calibre-bold.woff2') format('woff2');}
body{margin:0;padding:0;background:#fbfbfb;-webkit-font-smoothing:antialiased;}
</style>
</head>
<body style="margin:0;background:#fbfbfb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfbfb;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#ffffff;border:1px solid #f0f0f0;border-radius:16px;">
<tr><td style="padding:20px 32px;border-bottom:1px solid #f0f0f0;">
${GEO_LOGO}<span style="font-family:${FONT};font-weight:700;font-size:19px;letter-spacing:-0.02em;color:#202020;vertical-align:middle;margin-left:9px;">Geo</span>
</td></tr>
<tr><td style="padding:32px 32px 28px;">
<h1 style="margin:0 0 10px;font-family:${FONT};font-weight:600;font-size:23px;line-height:1.25;color:#202020;">${title}</h1>
<p style="margin:0 0 26px;font-family:${FONT};font-weight:400;font-size:16px;line-height:1.55;color:#606060;">${body}</p>
${cta}
</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #f0f0f0;">
<p style="margin:0 0 6px;font-family:${FONT};font-weight:400;font-size:13px;line-height:1.5;color:#b6b6b6;">You're receiving this because you're an editor${footerSpace} in Geo.</p>
<p style="margin:0;font-family:${FONT};font-weight:400;font-size:13px;line-height:1.5;color:#b6b6b6;"><a href="${esc(input.unsubscribeSpaceUrl)}" style="${unsubLinkStyle}">Unsubscribe</a> from ${spaceLabel}&nbsp;&middot;&nbsp;<a href="${esc(input.unsubscribeAllUrl)}" style="${unsubLinkStyle}">Unsubscribe from all</a> Geo notifications</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
