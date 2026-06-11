import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		// Only needed for `db:migrate`/introspection; `db:generate` diffs the
		// schema offline and does not connect.
		url: process.env.DATABASE_URL ?? "",
	},
});
