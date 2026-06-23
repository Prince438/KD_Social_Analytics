import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Single shared Postgres connection. In serverless (Vercel) we keep the pool
 * small; `prepare: false` plays nicely with connection poolers like PgBouncer
 * / Neon's pooled endpoint.
 */
const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.client ??
  postgres(env.DATABASE_URL, { max: 5, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { schema };
