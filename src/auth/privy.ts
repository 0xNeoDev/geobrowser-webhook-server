import { PrivyClient } from "@privy-io/server-auth";
import { config } from "../config";

// Lazily constructed so importing this module doesn't require Privy env at
// load time (and so it's only built once per process).
let client: PrivyClient | null = null;
function privy(): PrivyClient {
	if (!client) {
		client = new PrivyClient(config.privyAppId, config.privyAppSecret);
	}
	return client;
}

/** Verify a Privy access token and return the user's Privy DID (`sub`). Throws if invalid. */
export async function verifyPrivyToken(token: string): Promise<string> {
	const claims = await privy().verifyAuthToken(token);
	return claims.userId;
}

/**
 * Resolve the user's verified email from Privy by DID. Best-effort: returns
 * null if the user has no linked email or the lookup fails. Never trust an
 * email from the client — this is the only source.
 */
export async function getPrivyEmail(privyUserId: string): Promise<string | null> {
	try {
		const user = await privy().getUserById(privyUserId);
		return user.email?.address ?? null;
	} catch {
		return null;
	}
}
