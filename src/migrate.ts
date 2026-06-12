// Standalone migration runner for deploys (used by the migrate initContainer).
// Uses drizzle-orm's programmatic migrator (a runtime dep) so it works in the
// production image without drizzle-kit (a dev dep). Applies everything in ./drizzle.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { config } from "./config";

const sql = postgres(config.databaseUrl, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrations applied");
