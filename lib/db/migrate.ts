import { setDefaultResultOrder } from "node:dns";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

try {
  setDefaultResultOrder("ipv4first");
} catch (_error) {
  // setDefaultResultOrder isn't available on older Node versions; ignore in that case.
}

config({ path: ".env.local" });
config({ path: ".env", override: false });

const runMigrate = async () => {
  const isVercel = process.env.VERCEL === "1";
  const migrationsExplicitlyEnabled =
    process.env.RUN_MIGRATIONS_ON_VERCEL === "true";
  const shouldSkipMigrations =
    process.env.SKIP_MIGRATIONS === "true" ||
    (isVercel && !migrationsExplicitlyEnabled);

  if (shouldSkipMigrations) {
    console.log(
      "? Skipping migrations because",
      process.env.SKIP_MIGRATIONS === "true"
        ? "SKIP_MIGRATIONS is true."
        : "we are running on Vercel and RUN_MIGRATIONS_ON_VERCEL is not true."
    );
    return;
  }

  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const connection = postgres(process.env.POSTGRES_URL, {
    max: 1,
    ssl: process.env.POSTGRES_URL.includes("sslmode") ? "require" : undefined,
    onnotice: () => {},
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
  const isVercel = process.env.VERCEL === "1";
  const shouldIgnoreFailure =
    process.env.IGNORE_MIGRATION_FAILURES === "true" ||
    (isVercel && process.env.RUN_MIGRATIONS_ON_VERCEL !== "true");

  if (shouldIgnoreFailure) {
    console.error("? Migration failed (ignored)");
    console.error(err);
    return;
  }

  console.error("? Migration failed");
  console.error(err);
  process.exit(1);
});
