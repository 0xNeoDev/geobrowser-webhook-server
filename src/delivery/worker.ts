// Email outbox worker: decouples email from the webhook ack. The receiver
// persists each notification `pending` and returns 2xx immediately; this loop
// durably picks up pending rows, attempts delivery, and retries with backoff
// (see deliver.ts). Survives restarts (state is in the DB) and is safe across
// replicas (claim uses FOR UPDATE SKIP LOCKED).

import { config } from "../config";
import { db } from "../db/client";
import { claimPendingEmails } from "../repo/notifications";
import { deliverOutbound } from "./deliver";

let stopRequested = false;
let running = false;
let wake: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		// Let stopEmailWorker() cut the wait short for a prompt shutdown.
		wake = () => {
			clearTimeout(timer);
			wake = null;
			resolve();
		};
	});
}

/** One poll: claim a due batch of pending emails and process each. Returns the count. */
async function tick(): Promise<number> {
	const rows = await claimPendingEmails(db, config.emailClaimBatch, config.emailLeaseSeconds);
	for (const row of rows) {
		if (stopRequested) {
			break;
		}
		await deliverOutbound(db, row);
	}
	return rows.length;
}

async function loop(): Promise<void> {
	running = true;
	console.log(
		`[email-worker] started (poll=${config.emailWorkerPollMs}ms, batch=${config.emailClaimBatch}, maxAttempts=${config.emailMaxAttempts})`,
	);
	while (!stopRequested) {
		try {
			const processed = await tick();
			// Drained a full batch → likely more waiting; poll again immediately.
			if (processed < config.emailClaimBatch) {
				await sleep(config.emailWorkerPollMs);
			}
		} catch (err) {
			console.error("[email-worker] poll error", err);
			await sleep(config.emailWorkerPollMs);
		}
	}
	running = false;
	console.log("[email-worker] stopped");
}

/** Start the worker loop (idempotent — a second call is a no-op while running). */
export function startEmailWorker(): void {
	if (running) {
		return;
	}
	stopRequested = false;
	void loop();
}

/** Request a graceful stop after the in-flight row; wakes an idle poll immediately. */
export function stopEmailWorker(): void {
	stopRequested = true;
	wake?.();
}
