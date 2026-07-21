import { defineConfig } from "drizzle-kit";

/**
 * Migrations are checked in and applied by `drizzle-kit migrate` as a Railway
 * pre-deploy step, so they must stay additive/backwards-compatible: the old
 * web release is still serving traffic while the new schema lands.
 */
export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
