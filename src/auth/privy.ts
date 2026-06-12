import { PrivyClient } from "@privy-io/server-auth";
import { config } from "../config";

/**
 * Auth provider boundary. The default implementation wraps Privy; tests can
 * swap in a mock via `setAuthProvider` so routes can be exercised end-to-end
 * without a live Privy app. Routes/middleware call `verifyPrivyToken` /
 * `getPrivyEmail`, which delegate to the active provider.
 */
export interface AuthProvider {
	/** Verify an access token and return the user's Privy DID (`sub`). Throws if invalid. */
	verifyToken(token: string): Promise<string>;
	/** Best-effort verified email for a Privy DID; null if none / lookup fails. */
	getEmail(privyUserId: string): Promise<string | null>;
}

// Lazily constructed so importing this module doesn't require Privy env at
// load time (and so it's only built once per process).
let client: PrivyClient | null = null;
function privy(): PrivyClient {
	if (!client) {
		client = new PrivyClient(config.privyAppId, config.privyAppSecret);
	}
	return client;
}

const realProvider: AuthProvider = {
	verifyToken: async (token) => {
		const claims = await privy().verifyAuthToken(token);
		return claims.userId;
	},
	getEmail: async (privyUserId) => {
		try {
			const user = await privy().getUserById(privyUserId);
			return user.email?.address ?? null;
		} catch {
			return null;
		}
	},
};

let activeProvider: AuthProvider = realProvider;

/** Test seam: override the auth provider (e.g. with a mock). */
export function setAuthProvider(provider: AuthProvider): void {
	activeProvider = provider;
}

/** Restore the real Privy-backed provider. */
export function resetAuthProvider(): void {
	activeProvider = realProvider;
}

export function verifyPrivyToken(token: string): Promise<string> {
	return activeProvider.verifyToken(token);
}

export function getPrivyEmail(privyUserId: string): Promise<string | null> {
	return activeProvider.getEmail(privyUserId);
}
