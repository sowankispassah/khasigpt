---
name: db-loading-resilience
description: Use when adding, changing, debugging, or reviewing any KhasiGPT DB-backed page, API route, read model, admin section, billing/subscription/upgrade flow, chat history/sidebar/detail flow, image or voice chat flow, jobs/RAG flow, feature setting, translation/language resource, schema migration, or write path where missing/null/new/bad rows, slow queries, failed writes, or incomplete records could leave loading stuck, blank, zeroed, or all-or-nothing.
---

# DB Loading Resilience

## Objective

Make DB-backed UI and API flows degrade deliberately: one bad row, missing field, slow optional query, failed write, or changed schema must not break the full page, full list, app shell, or mobile bootstrap.

## Required Workflow

1. Audit before editing. Name the exact fragile read/write paths found, including routes, components, services, and queries.
2. Classify each dependency as critical or optional.
3. Keep critical failures bounded with explicit error/recovery UI or JSON. Do not leave infinite loading.
4. Isolate optional failures with per-section fallback, partial data, warnings, and logs.
5. Validate rows before rendering or serializing. Skip or mark only the bad record; do not throw the entire list.
6. Ensure writes produce a minimum valid record or end in a terminal failure state.
7. Run the nearest checks before finishing: targeted Biome, `pnpm typecheck`, and `pnpm build` for rendering/API changes. Run tests when the touched flow has coverage or risk.

## Read Rules

- Do not assume nullable DB fields exist just because current seed data has them.
- Do not parse JSON metadata without a safe parser and defaults.
- Do not assume joins always return related rows.
- Do not assume every chat has messages, every image/voice/job process completed, or every setting row exists.
- Do not turn real query failures into fake empty success. Return partial/degraded metadata when possible, or a retryable error state when the whole resource is unavailable.
- Use bounded reads for user-facing loading paths with `withTimeout` or the existing local helper.
- Prefer existing read-model fallbacks in `lib/api/read-models.ts`, feature-setting helpers, translation bundle fallbacks, and domain normalizers before creating new patterns.
- Lists must process records independently. A malformed row should be skipped, shown with a safe placeholder, or marked failed while valid rows still render.

## Write Rules

- Make creation flows atomic where the UI will depend on the record immediately.
- Give image, voice, chat, job, and async records explicit lifecycle values such as `pending`, `completed`, `failed`, or `cancelled`.
- If a downstream operation fails, update the record to `failed` with safe metadata instead of leaving a broken `pending` row.
- Never write fallback/default settings back to the DB unless an admin explicitly saves.
- If a schema change adds a field used by reads, add a real migration, a DB default where appropriate, and backward-compatible parsing for old rows.

## UI And API Behavior

- App shell, sidebar, feature navigation, languages, billing widgets, and bootstrap must not depend on admin/settings/RAG success.
- Admin pages should show section-level unavailable states rather than blanking the whole console.
- Billing/subscription/upgrade pages should show available plans even if balance/usage history fails, and should show balance unavailable separately.
- Chat details should render a recovery state when the chat or messages cannot be confirmed. Existing valid messages should still display when available.
- Mobile endpoints should include degraded metadata for partial responses and `no-store` on transient error responses.
- Loading states must end in one of: success, empty, partial/degraded, or retryable error.

## Schema And Query Hygiene

- Keep query code in `lib/db/queries.ts` or relevant `lib/` domain services and use Drizzle consistently.
- Add migrations under `lib/db/migrations/` for schema changes.
- Add indexes for hot filters such as `userId`, `chatId`, `createdAt`, `status`, `type`, feature key, and job/status keys when missing.
- Avoid broad rewrites. Patch the fragile boundary and reuse existing local helpers.

## Final Report

State:
- fragile paths found before changes
- files changed
- fallback/partial/error behavior added
- schema or migration changes
- checks run and any not run
- remaining risk, especially any DB-backed surface not audited
