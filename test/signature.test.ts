import { describe, expect, it } from "bun:test";
import { verifySignature } from "../src/lib/signature";

const SECRET = "test-secret";
const encoder = new TextEncoder();

async function sign(body: ArrayBuffer, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
	const sig = await crypto.subtle.sign("HMAC", key, body);
	const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `sha256=${hex}`;
}

function bytes(s: string): ArrayBuffer {
	return encoder.encode(s).buffer as ArrayBuffer;
}

describe("verifySignature", () => {
	it("accepts a correct signature", async () => {
		const body = bytes('{"event_type":"proposal_created"}');
		expect(await verifySignature(body, SECRET, await sign(body, SECRET))).toBe(true);
	});

	it("rejects a signature made with the wrong secret", async () => {
		const body = bytes('{"event_type":"proposal_created"}');
		expect(await verifySignature(body, SECRET, await sign(body, "wrong-secret"))).toBe(false);
	});

	it("rejects a tampered body", async () => {
		const signed = await sign(bytes('{"a":1}'), SECRET);
		expect(await verifySignature(bytes('{"a":2}'), SECRET, signed)).toBe(false);
	});

	it("rejects a header without the sha256= prefix", async () => {
		const body = bytes("{}");
		const raw = (await sign(body, SECRET)).slice("sha256=".length);
		expect(await verifySignature(body, SECRET, raw)).toBe(false);
	});
});
