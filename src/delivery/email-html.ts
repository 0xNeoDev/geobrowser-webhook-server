// HTML rendering of a notification email, styled to match Geo Browser
// (geogenesis): Calibre font + brand palette (text #202020, primary #3963fe,
// bg #fbfbfb, dividers #f0f0f0, muted #606060/#b6b6b6).
//
// Table-based + inline styles for email-client robustness. The @font-face uses
// a relative /fonts path that resolves in the local preview; email clients that
// can't load it fall back to the Helvetica/Arial stack.

const FONT = "'Calibre','Helvetica Neue',Helvetica,Arial,sans-serif";

// Geo logo (from geogenesis design-system GeoLogoLarge): black mark + pink→purple
// gradient ring. Inline SVG renders in the preview and modern clients; clients
// that strip SVG just show the "Geo" wordmark beside it. For broad email support,
// swap this for a hosted PNG <img>.
const GEO_LOGO = `<svg width="26" height="26" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
<path fill-rule="evenodd" clip-rule="evenodd" d="M14.3558 14.5685C14.5064 14.824 14.4369 15.1543 14.1838 15.3089C12.9706 16.0499 11.5349 16.4784 9.99619 16.4784C8.46312 16.4784 7.0323 16.053 5.82196 15.3171C5.56819 15.1628 5.49827 14.832 5.64911 14.5761L9.51384 8.02041C9.73427 7.6465 10.2751 7.6465 10.4955 8.02041L14.3558 14.5685ZM4.94964 16.9532C4.66671 16.787 4.29709 16.8695 4.13047 17.1522L2.95809 19.1408C2.73416 19.5207 3.00801 20 3.44895 20H16.5604C17.0014 20 17.2752 19.5207 17.0513 19.1408L15.8745 17.1447C15.7077 16.8618 15.3376 16.7795 15.0546 16.9462C13.5791 17.8155 11.8478 18.3159 9.99619 18.3159C8.14957 18.3159 6.4226 17.8182 4.94964 16.9532Z" fill="#202020"/>
<circle cx="9.99613" cy="8.49619" r="7.4278" transform="rotate(-180 9.99613 8.49619)" stroke="url(#geoLogoGradient)" stroke-width="2.13675"/>
<defs><radialGradient id="geoLogoGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(9.99613 15.4291) rotate(-90) scale(15.4291 55.084)"><stop stop-color="#FF78E6"/><stop offset="1" stop-color="#9542FF"/></radialGradient></defs>
</svg>`;

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
