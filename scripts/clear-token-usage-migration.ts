import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

async function main() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("POSTGRES_URL is not defined.");
  }

  const sql = postgres(connectionString, {
    ssl: connectionString.includes("sslmode") ? "require" : undefined,
  });

  try {
    await sql`DELETE FROM "_drizzle_migrations" WHERE id = '0010_token-usage-tracking'`;
    await sql`DROP TABLE IF EXISTS "TokenUsage"`;
    await sql`DROP TABLE IF EXISTS token_usage`;
    console.log("Cleared previous token usage migration artifacts.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Failed to clear token usage migration artifacts.");
  console.error(error);
  process.exit(1);
});
