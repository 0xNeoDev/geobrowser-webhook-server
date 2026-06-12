// Hono environment for authenticated routes.
// `privyUserId` is set by requirePrivyAuth; `userSpaceId` by requireUser.
export type AppEnv = {
	Variables: {
		privyUserId: string;
		userSpaceId: string;
	};
};
