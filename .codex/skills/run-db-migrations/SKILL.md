---
name: run-db-migrations
description: Use whenever this KhasiGPT repository adds or changes database tables, columns, indexes, enums, constraints, Drizzle schema definitions, migration SQL files, or DB-backed write/read behavior that depends on a schema change. Ensures migrations are created when needed and run before finishing.
---

# Run DB Migrations

## Required Workflow

When a task changes `lib/db/schema.ts`, adds or edits files in `lib/db/migrations/`, or adds code that depends on new DB fields/tables:

1. Confirm there is a real SQL migration under `lib/db/migrations/` for every schema change.
2. Keep migration SQL idempotent where practical with `IF NOT EXISTS` or guarded `ALTER TABLE` clauses.
3. Run the migration before finishing:

```powershell
pnpm.cmd db:migrate
```

4. If the migration fails, stop and fix the migration or schema mismatch before reporting completion.
5. After a successful migration, run the nearest validation for the touched code, usually:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
```

Run `pnpm.cmd build` when routing, server rendering, API routes, or shared layouts changed.

## Rules

- Do not treat `pnpm.cmd build`, `pnpm.cmd typecheck`, or Drizzle schema edits as a substitute for applying migrations.
- Do not use `db:push` as the default path for production schema changes; prefer committed migrations.
- Do not mark DB-backed work complete if code references columns or tables that have not been migrated locally.
- If a migration was already applied and reruns cleanly, report that `pnpm.cmd db:migrate` completed successfully.
- If environment variables are missing, report the exact missing variable and do not claim the database was migrated.

## Reporting

In the final response, include:

- The migration command run.
- Whether it succeeded or failed.
- Any validation commands run afterward.
- Any remaining deployment note, such as needing the same migration applied in production.
