import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One pool per process. `pg` connects lazily, so importing this module without
 * DATABASE_URL set is safe — it fails on first query, not at build time. That
 * matters because Next collects page modules during `next build`.
 *
 * The globalThis cache keeps dev hot-reload from leaking a pool per edit.
 */
const globalForDb = globalThis as unknown as { ovyroPool?: Pool };

export const pool =
  globalForDb.ovyroPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.ovyroPool = pool;
}

export const db = drizzle(pool, { schema });

export type Db = typeof db;

export * from "./ids";
export { schema };
