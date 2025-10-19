import { setDefaultResultOrder } from "node:dns";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

try {
  setDefaultResultOrder("ipv4first");
} catch (error) {
  // setDefaultResultOrder isn't available on older Node versions; ignore in that case.
}

config({ path: ".env.local" });
config({ path: ".env", override: false });

const runMigrate = async () => {
  const shouldSkipMigrations =
    process.env.SKIP_MIGRATIONS === "true";

  if (shouldSkipMigrations) {
    console.log(
      "? Skipping migrations because",
      process.env.SKIP_MIGRATIONS === "true"
        ? "SKIP_MIGRATIONS is true."
        : "of the current environment configuration."
    );
    return;
  }

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const connection = postgres(process.env.POSTGRES_URL, {
    max: 1,
    ssl: process.env.POSTGRES_URL.includes("sslmode") ? "require" : undefined,
  });
  const db = drizzle(connection);

  console.log("? Running migrations...");

  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  const end = Date.now();

  console.log("? Migrations completed in", end - start, "ms");
  process.exit(0);
};

runMigrate().catch((err) => {
  const shouldIgnoreFailure =
    process.env.IGNORE_MIGRATION_FAILURES === "true";

  if (shouldIgnoreFailure) {
    console.error("? Migration failed (ignored)");
    console.error(err);
    return;
  }

  console.error("? Migration failed");
  console.error(err);
  process.exit(1);
});
