import { existsSync } from "node:fs";

/**
 * Many test files talk to the same PostgreSQL at once, and every file has its own database client. Left alone, each client opens
 * as many connections as it likes (the default is twice the number of processor cores, plus one), so a full test run plus the
 * running app can pass the database's limit of 100 and fail with "too many clients already". Each client is capped here, and
 * waits patiently for a free connection instead of giving up after 10 seconds.
 */
if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "60");
  process.env.DATABASE_URL = url.toString();
}
