import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config";
import * as schema from "./schema";

// Single shared connection pool for the process.
const queryClient = postgres(config.databaseUrl, { max: config.dbPoolMax });

export const db = drizzle(queryClient, { schema });
export { queryClient };
export type Db = typeof db;
