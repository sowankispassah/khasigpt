import { setDefaultResultOrder } from "node:dns";
import fs from "node:fs";
import path from "node:path";
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

const MIGRATIONS_FOLDER = "./lib/db/migrations";
const MIGRATIONS_META_FOLDER = path.join(MIGRATIONS_FOLDER, "meta");
const MIGRATIONS_JOURNAL_PATH = path.join(MIGRATIONS_META_FOLDER, "_journal.json");
const DEFAULT_JOURNAL_VERSION = "7";
const DEFAULT_JOURNAL_DIALECT = "postgresql";

type MigrationJournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type MigrationJournalFile = {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
};

function listMigrationTags() {
  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name.replace(/\.sql$/, ""))
    .sort((a, b) => a.localeCompare(b));
}

function readMigrationJournal(): MigrationJournalFile {
  if (!fs.existsSync(MIGRATIONS_JOURNAL_PATH)) {
    return {
      version: DEFAULT_JOURNAL_VERSION,
      dialect: DEFAULT_JOURNAL_DIALECT,
      entries: [],
    };
  }

  try {
    const content = fs.readFileSync(MIGRATIONS_JOURNAL_PATH, "utf8");
    const parsed = JSON.parse(content) as Partial<MigrationJournalFile>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return {
      version:
        typeof parsed.version === "string"
          ? parsed.version
          : DEFAULT_JOURNAL_VERSION,
      dialect:
        typeof parsed.dialect === "string"
          ? parsed.dialect
          : DEFAULT_JOURNAL_DIALECT,
      entries: entries.filter(
        (entry): entry is MigrationJournalEntry =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              typeof entry.tag === "string" &&
              typeof entry.when === "number"
          )
      ),
    };
  } catch {
    return {
      version: DEFAULT_JOURNAL_VERSION,
      dialect: DEFAULT_JOURNAL_DIALECT,
      entries: [],
    };
  }
}

function syncMigrationJournal(
  tags: string[],
  lastRecordedCreatedAt: number | null
) {
  const existing = readMigrationJournal();
  const existingByTag = new Map(existing.entries.map((entry) => [entry.tag, entry]));
  const existingWhenValues = existing.entries
    .map((entry) => entry.when)
    .filter((value) => Number.isFinite(value));
  const minExistingWhen =
    existingWhenValues.length > 0 ? Math.min(...existingWhenValues) : null;
  const shouldRebaseExistingWhenValues =
    lastRecordedCreatedAt !== null &&
    minExistingWhen !== null &&
    minExistingWhen > lastRecordedCreatedAt;

  const shouldInitializeAgainstExistingDbState =
    lastRecordedCreatedAt !== null &&
    (existing.entries.length === 0 || shouldRebaseExistingWhenValues);

  const baseWhenFromDbState =
    shouldInitializeAgainstExistingDbState && tags.length > 0
      ? Math.max(lastRecordedCreatedAt - tags.length + 1, 1)
      : null;
  let nextWhen =
    baseWhenFromDbState !== null
      ? baseWhenFromDbState + tags.length
      : existingWhenValues.length > 0
        ? Math.max(...existingWhenValues) + 1
        : Date.now();

  const nextEntries: MigrationJournalEntry[] = tags.map((tag, idx) => {
    if (baseWhenFromDbState !== null) {
      return {
        idx,
        version: DEFAULT_JOURNAL_VERSION,
        when: baseWhenFromDbState + idx,
        tag,
        breakpoints: true,
      };
    }

    const known = existingByTag.get(tag);
    if (known) {
      return {
        idx,
        version:
          typeof known.version === "string"
            ? known.version
            : DEFAULT_JOURNAL_VERSION,
        when: known.when,
        tag,
        breakpoints:
          typeof known.breakpoints === "boolean" ? known.breakpoints : true,
      };
    }

    const entry: MigrationJournalEntry = {
      idx,
      version: DEFAULT_JOURNAL_VERSION,
      when: nextWhen,
      tag,
      breakpoints: true,
    };
    nextWhen += 1;
    return entry;
  });

  const nextJournal: MigrationJournalFile = {
    version:
      typeof existing.version === "string"
        ? existing.version
        : DEFAULT_JOURNAL_VERSION,
    dialect:
      typeof existing.dialect === "string"
        ? existing.dialect
        : DEFAULT_JOURNAL_DIALECT,
    entries: nextEntries,
  };

  fs.mkdirSync(MIGRATIONS_META_FOLDER, { recursive: true });
  fs.writeFileSync(
    MIGRATIONS_JOURNAL_PATH,
    `${JSON.stringify(nextJournal, null, 2)}\n`,
    "utf8"
  );

  return nextEntries;
}

async function ensureDrizzleMeta(client: ReturnType<typeof postgres>) {
  await client.unsafe('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `);
}

async function getLastRecordedMigrationMillis(
  client: ReturnType<typeof postgres>
) {
  const rows = await client.unsafe<{ created_at: number | string | null }[]>(
    'SELECT "created_at" FROM "drizzle"."__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 1'
  );
  const value = rows?.[0]?.created_at;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

async function hasLegacyPublicSchema(client: ReturnType<typeof postgres>) {
  const rows = await client.unsafe<{ exists: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('User', 'Chat', 'AppSetting')
    ) AS "exists"
  `);

  return rows?.[0]?.exists === true;
}

async function bootstrapLegacyMigrationBaseline({
  client,
  entries,
}: {
  client: ReturnType<typeof postgres>;
  entries: MigrationJournalEntry[];
}) {
  const lastRecorded = await getLastRecordedMigrationMillis(client);
  if (lastRecorded !== null || entries.length === 0) {
    return;
  }

  const hasLegacySchema = await hasLegacyPublicSchema(client);
  if (!hasLegacySchema) {
    return;
  }

  const explicitTag = process.env.DRIZZLE_BASELINE_TAG?.trim();
  const explicitEntry =
    explicitTag && explicitTag.length > 0
      ? entries.find((entry) => entry.tag === explicitTag)
      : null;

  const fallbackEntry =
    entries.length > 1 ? entries[entries.length - 2] : entries[0];
  const baselineEntry = explicitEntry ?? fallbackEntry;

  if (!baselineEntry) {
    return;
  }

  await client.unsafe(
    `
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES ($1, $2)
    `,
    [`baseline:${baselineEntry.tag}`, baselineEntry.when]
  );

  console.log(
    `? Bootstrapped migration baseline at "${baselineEntry.tag}" (${baselineEntry.when}).`
  );
  if (!explicitEntry && entries.length > 1) {
    const nextTag = entries[entries.length - 1]?.tag;
    if (nextTag) {
      console.log(
        `? Next migration candidate to apply is "${nextTag}". Set DRIZZLE_BASELINE_TAG to override baseline selection.`
      );
    }
  }
}

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

  await ensureDrizzleMeta(connection);
  const lastRecordedBeforeSync = await getLastRecordedMigrationMillis(connection);
  const migrationTags = listMigrationTags();
  const journalEntries = syncMigrationJournal(
    migrationTags,
    lastRecordedBeforeSync
  );
  await bootstrapLegacyMigrationBaseline({
    client: connection,
    entries: journalEntries,
  });

  console.log("? Running migrations...");

  const start = Date.now();
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
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
