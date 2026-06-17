import { config } from "../config";

const MAILERSEND_URL = "https://api.mailersend.com/v1/email";

/** Email channel state: usable, or missing MailerSend credentials. */
export type EmailChannelStatus = "ok" | "unconfigured";

/**
 * Whether the email channel can send: `ok` if the MailerSend API key + sender are
 * set, else `unconfigured` (in-app-only deploy / local dev).
 */
export function emailChannelStatus(): EmailChannelStatus {
	return config.mailersendApiKey && config.mailersendFromEmail ? "ok" : "unconfigured";
}

/** Convenience: the channel is usable. */
export function isEmailConfigured(): boolean {
	return emailChannelStatus() === "ok";
}

/**
 * Send a transactional email via MailerSend's REST API. Throws on non-2xx so
 * the caller can log and continue (email is best-effort; the in-app row is the
 * durable delivery). Assumes `isEmailConfigured()`.
 */
export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
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

	if (!res.ok) {
		throw new Error(`MailerSend responded ${res.status}: ${await res.text()}`);
	}
}
