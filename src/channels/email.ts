import { config } from "../config";

const MAILERSEND_URL = "https://api.mailersend.com/v1/email";

/**
 * Whether the email channel is usable: enabled (`EMAIL_ENABLED`, default true)
 * AND configured (API key + sender). Setting `EMAIL_ENABLED=false` is the global
 * kill-switch — `deliverEmail` short-circuits on this before any send.
 */
export function isEmailConfigured(): boolean {
	return config.emailEnabled && Boolean(config.mailersendApiKey && config.mailersendFromEmail);
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
