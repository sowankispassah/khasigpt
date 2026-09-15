# Repo Skills

This file complements `AGENTS.md`. It defines the small set of specialist skills worth using for AI-assisted work in this repository.

Keep the skill set narrow. A few explicit, high-signal skills are better than many overlapping prompts.

These skills should operate at a senior production-engineering bar: the standard is closer to SRE / Builders' Library / hyperscale production engineering than to tutorial-grade app development.

## Senior Engineer Bar
- Prefer the simplest design that preserves correctness, operability, and future change. Do not add abstraction, indirection, or dependencies without a measured reason.
- Design for failure. Remote calls, background work, and multi-step mutations must consider timeouts, retries, idempotency, backoff, and partial failure behavior.
- Keep work bounded. Avoid unbounded queries, unbounded lists, unbounded retries, and unbounded client rendering.
- Optimize based on measurement, not aesthetics. Think in terms of p50/p95/p99 latency, throughput, render cost, cache hit rate, query shape, and blast radius.
- Make changes safe to roll out. Favor small diffs, feature flags, reversible migrations, compatibility windows, and easy rollback paths.
- Treat observability as part of the implementation. Critical paths should be diagnosable through logs, metrics, traces, or explicit error surfaces.
- Protect correctness and data integrity before optimizing throughput. State transitions, billing, auth, and admin flows must be explicit and hard to misuse.
- Assume ownership beyond merge. A change is not complete if it cannot be operated, debugged, or extended safely.

## Skill Design Rules
- Give each skill a clear scope, file boundary, and success criteria.
- Describe when the skill should be used, not just what it knows.
- Tie every skill to concrete validation commands already used in this repo.
- Prefer specialist skills for fragile or high-risk areas: shared shell, routing, security, auth, database, caching, jobs, billing, and release checks.
- If these are later formalized as GitHub custom agents, store them under `.github/agents/*.agent.md` with focused descriptions, tool scopes, and prompts.
- Every skill should enforce the Senior Engineer Bar above, not bypass it for speed.

## Recommended Skills

### 1. `app-shell-navigation`
Use when changing shared layout behavior, persistent menus, route transitions, loading states, sidebar interactions, or global click feedback.

Own these areas:
- `app/layout.tsx`
- `components/site-shell.tsx`
- `components/site-shell-extras.tsx`
- `components/page-user-menu.tsx`
- `components/user-dropdown-menu.tsx`
- `components/global-progress-bar.tsx`
- `lib/ui/global-progress.ts`
- `app/globals.css`

Primary responsibilities:
- Keep the user menu available anywhere `SiteShell` is used.
- Preserve instant navigation feedback and top progress bar behavior.
- Enforce semantic interactive elements and explicit hand cursor behavior.
- Avoid route-level UI duplication when behavior belongs in the shared shell.
- Keep shared UI boring and dependable: fast first paint, predictable states, no duplicated source of truth, and no fragile one-off route behavior.
- Require loading, disabled, error, and recovery states for user-triggered async work.

Verification:
- `pnpm typecheck`
- `pnpm lint`
- Manual route checks across `(public)`, `(auth)`, `(chat)`, `(admin)`, and `[lang]`

### 2. `next-performance-caching`
Use when changing layouts, route handlers, server components, dynamic imports, caching strategy, loading boundaries, or bundle-heavy UI.

Own these areas:
- `app/**`
- `components/**`
- `lib/utils/prefetch.ts`
- `lib/i18n/**`
- `lib/ai/model-registry.ts`
- `lib/ai/image-model-registry.ts`
- `next.config.ts`

Primary responsibilities:
- Keep Server Components as the default.
- Keep client islands small and code-split heavy UI with `next/dynamic`.
- Reuse `next/image` for render-critical images.
- Review `unstable_cache`, `revalidateTag`, route-handler caching, and response cache headers.
- Prevent slow layouts by using parallel reads, tight timeouts, and minimal first-render data.
- Make performance decisions measurable: identify which path is hot, which work is cached, and what invalidates that cache.
- Favor stable, low-complexity rendering paths over clever optimizations that are hard to reason about.

Verification:
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

### 3. `api-auth-security`
Use when touching auth flows, middleware, permissions, CORS, headers, rate limiting, uploads, impersonation, admin routes, or public API exposure.

Own these areas:
- `proxy.ts`
- `app/api/**`
- `app/(auth)/**`
- `lib/security/**`
- `next.config.ts`

Primary responsibilities:
- Keep authorization on the server.
- Enforce rate limiting, secure redirects, CORS boundaries, and response hardening.
- Avoid leaking secrets, tokens, or sensitive user data.
- Require validation and sanitization for all external input.
- Review whether route changes create new public attack surface.
- Treat retries and duplicate submissions as expected behavior. Mutations should be safe under refreshes, retries, and race conditions wherever practical.
- Prefer explicit failure modes over silent security degradation.

Verification:
- `pnpm typecheck`
- `pnpm lint`
- Targeted auth or API request testing

### 4. `db-query-scale`
Use when adding queries, changing schema, touching reporting screens, admin data panels, jobs ingestion, subscription/billing state, or anything on a hot request path.

Own these areas:
- `lib/db/schema.ts`
- `lib/db/queries.ts`
- `lib/db/migrations/**`
- domain services under `lib/**` that execute DB-heavy workflows

Primary responsibilities:
- Keep query logic centralized and review hot-path latency.
- Avoid N+1 patterns and unbounded scans.
- Require index awareness for new filters, joins, and dashboards.
- Use migrations for schema changes only.
- For manual data creation tasks, provide SQL instead of telling people to run `db:migrate`.
- Protect transactional correctness for billing, credits, coupons, invites, auth-linked records, and admin writes.
- Prefer append-only audit trails or explicit state transitions over implicit mutation history loss.

Verification:
- `pnpm typecheck`
- `pnpm lint`
- production-like review of query shape and index coverage

### 5. `chat-ai-integrations`
Use when changing chat streaming, model selection, attachments, RAG retrieval, job-chat flows, prompt handling, or provider integration behavior.

Own these areas:
- `components/chat*.tsx`
- `components/message*.tsx`
- `components/sidebar-history*.tsx`
- `lib/ai/**`
- `lib/chat/**`
- `lib/rag/**`
- `lib/uploads/**`
- `app/(chat)/**`

Primary responsibilities:
- Preserve perceived speed for chat entry, streaming, and history navigation.
- Keep model/provider logic centralized.
- Avoid regressions in file handling, retrieval scope, or message rendering.
- Ensure heavy client features remain split and deferred when possible.
- Treat model, upload, and retrieval boundaries as contracts: validate inputs, cap expensive work, and keep fallback behavior explicit.
- Preserve low-latency interaction even when provider calls, retrieval, or attachment processing are slower than normal.

Verification:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` when behavior affects chat, attachments, or navigation

### 6. `operability-rollout`
Use when a change affects reliability, incident response, rollback safety, feature flags, migrations, cache invalidation, scheduled jobs, or cross-cutting production behavior.

Own these areas:
- `proxy.ts`
- `.github/workflows/**`
- `scripts/**`
- `app/api/**`
- cache invalidation paths in `lib/**`
- operationally sensitive route layouts and server actions

Primary responsibilities:
- Minimize blast radius with staged rollout thinking, even if the repo does not yet have formal canary infrastructure.
- Ensure changes have a plausible rollback path, especially for schema, auth, billing, and caching changes.
- Require enough logging and error context that production failures can be diagnosed quickly.
- Watch for overload patterns: retry storms, duplicate work, hot loops, heavy cold starts, and fan-out on request paths.

Verification:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- targeted scenario testing for rollback, retry, and degraded-dependency behavior

### 7. `release-guard`
Use before merging changes that affect shared UI, routing, auth, billing, admin, jobs, forum, or infrastructure-sensitive behavior.

Own these areas:
- repo-wide verification
- `.github/workflows/**`
- `playwright.config.ts`
- `tests/**`

Primary responsibilities:
- Run the relevant checks for the changed surface area.
- Look for production regressions, missing loading states, broken route transitions, auth bypasses, and cache invalidation gaps.
- Prefer targeted test additions over broad undocumented assumptions.
- Challenge the change at the level of operability, not just compilation: what breaks under concurrency, slowness, retries, or partial rollout?

Verification:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Selection Guide
- Use `app-shell-navigation` for persistent menu, progress bar, cursor, sidebar, and shared layout work.
- Use `next-performance-caching` for speed, render cost, caching, and bundle control.
- Use `api-auth-security` for anything exposed through `proxy.ts`, `app/api`, auth, or external requests.
- Use `db-query-scale` for schema, indexes, reports, heavy queries, and manual data operations.
- Use `chat-ai-integrations` for chat, RAG, models, uploads, and streaming.
- Use `operability-rollout` for rollback safety, cache invalidation, background jobs, incident-readiness, and reliability-sensitive changes.
- Use `release-guard` before shipping meaningful cross-cutting changes.

## Default Standard
- Any new skill added later must be more specific than `general frontend` or `backend expert`.
- Any new skill must name its owned files, trigger conditions, and verification steps.
- If a skill cannot point to a risky area in this repo, it should not exist.
- Any new skill should be strong enough that a senior engineer would trust it to protect production, not just produce code.
