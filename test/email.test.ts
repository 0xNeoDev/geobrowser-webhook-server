import { afterEach, describe, expect, it } from "bun:test";
import { sendEmail } from "../src/channels/email";

// sendEmail retries transient MailerSend failures (network / 429 / 5xx) with a
// short bounded backoff, and fails fast on permanent 4xx. We drive it with a
// scripted fetch mock and assert the number of attempts.

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** Mock global fetch to return a scripted sequence (status code, or "network" to throw). */
function mockFetch(sequence: Array<number | "network">): { count: number } {
	const calls = { count: 0 };
	globalThis.fetch = (async () => {
		const step = sequence[Math.min(calls.count, sequence.length - 1)];
		calls.count += 1;
		if (step === "network") {
			throw new Error("network unreachable");
		}
		return new Response("body", { status: step });
	}) as unknown as typeof fetch;
	return calls;
}

const INPUT = { to: "a@b.com", subject: "s", text: "t" };

describe("sendEmail — transient retry", () => {
	it("succeeds on a 2xx with a single attempt", async () => {
		const calls = mockFetch([202]);
		await sendEmail(INPUT);
		expect(calls.count).toBe(1);
	});

	it("retries a 5xx and succeeds on the next attempt", async () => {
		const calls = mockFetch([500, 202]);
		await sendEmail(INPUT);
		expect(calls.count).toBe(2);
	});

	it("retries a network error and succeeds on the next attempt", async () => {
		const calls = mockFetch(["network", 202]);
		await sendEmail(INPUT);
		expect(calls.count).toBe(2);
	});

	it("gives up after 3 attempts on persistent 5xx", async () => {
		const calls = mockFetch([503]);
		await expect(sendEmail(INPUT)).rejects.toThrow(/503/);
		expect(calls.count).toBe(3);
	});

	it("does not retry a permanent 4xx", async () => {
		const calls = mockFetch([400]);
		await expect(sendEmail(INPUT)).rejects.toThrow(/400/);
		expect(calls.count).toBe(1);
	});
});
