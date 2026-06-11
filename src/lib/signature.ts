// HMAC-SHA256 signature verification for inbound Geo webhook payloads.
// The Gaia delivery-worker signs each request with: X-Geo-Signature: sha256={hmac_hex}
// Uses the Web Crypto API (available on Bun, Node, Deno).

const SIGNATURE_PREFIX = "sha256=";
const encoder = new TextEncoder();

function hexEncode(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySignature(rawBody: ArrayBuffer, secret: string, signatureHeader: string): Promise<boolean> {
	if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
		return false;
	}

	const received = signatureHeader.slice(SIGNATURE_PREFIX.length);

	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
	const sig = await crypto.subtle.sign("HMAC", key, rawBody);
	const expected = hexEncode(sig);

	// Constant-time comparison.
	if (received.length !== expected.length) {
		return false;
	}
	let mismatch = 0;
	for (let i = 0; i < received.length; i++) {
		mismatch |= received.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return mismatch === 0;
}
