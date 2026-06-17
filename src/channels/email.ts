import { config } from "../config";

const MAILERSEND_URL = "https://api.mailersend.com/v1/email";

/** Email channel state: usable, turned off (`EMAIL_ENABLED=false`), or missing creds. */
export type EmailChannelStatus = "ok" | "disabled" | "unconfigured";

/**
 * Why (or whether) the email channel can send:
 *   - `disabled` — `EMAIL_ENABLED=false` (the global kill-switch).
 *   - `unconfigured` — MailerSend API key / sender not set (in-app-only deploy).
 *   - `ok` — enabled and configured.
 * Maps directly onto the `email_status` recorded when no email goes out.
 */
export function emailChannelStatus(): EmailChannelStatus {
	if (!config.emailEnabled) {
		return "disabled";
	}
	if (!(config.mailersendApiKey && config.mailersendFromEmail)) {
		return "unconfigured";
	}
	return "ok";
}

/** Convenience: the channel is usable (enabled + configured). */
export function isEmailConfigured(): boolean {
	return emailChannelStatus() === "ok";
}

// Bounded in-process retry for *transient* failures (network errors, 429, 5xx),
// to ride out brief MailerSend blips. Kept short because the webhook ack is awaited
// on this — a sustained outage exhausts these and surfaces as `email_status=failed`
// (which a future retry sweep can pick up). 4xx is permanent and not retried.
const MAX_SEND_ATTEMPTS = 3;
const RETRY_BASE_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Transient = worth retrying: 429 (rate limited) or 5xx (server error). */
function isTransientStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

/**
 * Send a transactional email via MailerSend's REST API, retrying transient
 * failures up to MAX_SEND_ATTEMPTS with short exponential backoff. Throws if all
 * attempts fail (or on a permanent 4xx) — the caller logs, records the outcome,
 * and continues (email is best-effort; the in-app row is the durable delivery).
 * Assumes `isEmailConfigured()`.
 */
export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(MAILERSEND_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${config.mailersendApiKey}`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					from: { email: config.mailersendFromEmail, name: config.mailersendFromName },
					to: [{ email: input.to }],
					subject: input.subject,
					text: input.text,
					...(input.html ? { html: input.html } : {}),
				}),
			});

			if (res.ok) {
				return;
			}
			lastError = new Error(`MailerSend responded ${res.status}: ${await res.text()}`);
			if (!isTransientStatus(res.status)) {
				throw lastError; // permanent (4xx) — don't retry
			}
		} catch (err) {
			if (err === lastError) {
				throw err; // permanent HTTP error raised above — propagate, no retry
			}
			lastError = err instanceof Error ? err : new Error(String(err)); // network error — retry
		}

		if (attempt < MAX_SEND_ATTEMPTS) {
			await sleep(RETRY_BASE_MS * 2 ** (attempt - 1)); // 200ms, 400ms
		}
	}

	throw lastError ?? new Error("MailerSend send failed");
}
