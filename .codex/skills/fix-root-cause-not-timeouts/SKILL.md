---
name: fix-root-cause-not-timeouts
description: Use when debugging or changing any timeout, stuck loading, slow API, slow DB query, admin panel fallback, login hang, native bootstrap delay, feature/sidebar disappearance, translation loading issue, forum loading issue, or production reliability regression. Requires proving and fixing the root cause instead of only adding/increasing timeouts or masking failures with fallback UI.
---

# Fix Root Cause, Not Timeouts

## Core Rule

Timeouts are containment, not a fix. Do not treat a timeout, skeleton fallback, retry button, or degraded warning as the solution unless the root cause has been measured, explained, and structurally reduced.

For this project, a slow path with one user is usually caused by architecture, cold starts, DB connection setup, query shape, missing indexes, broad cache invalidation, global state coupling, or a failed optional read being promoted into app-wide state. Investigate those causes first.

## Required Workflow

1. Reproduce or locate evidence.
   - Check production/runtime logs first when available.
   - Capture exact endpoint, route, component, mutation, query, and loading state.
   - Record which data was real, stale, fallback, unconfirmed, or missing.

2. Measure the failing path.
   - Add or inspect timing logs around each async boundary.
   - Separate auth/session time from optional bootstrap/settings time.
   - Separate DB connection wait from query execution when possible.
   - Log labels such as `admin.overview.user-count`, `mobile.bootstrap.features`, or `feature-settings.load`.

3. Identify the root class.
   - Too many first-render DB round trips.
   - Query is missing an index or over-fetching.
   - Parallel queries exceed a small serverless DB pool.
   - Cold function or cold DB pooler connection dominates latency.
   - One optional endpoint controls global auth, language, feature, or sidebar state.
   - Failed reads are converted into authoritative empty arrays, `0`, disabled flags, or English fallback.
   - Broad invalidation forces unrelated surfaces to reload together.

4. Fix the cause before relying on timeout handling.
   - Combine related dashboard reads into one compact snapshot query.
   - Split unrelated reads into independent endpoints with independent cache keys.
   - Add missing indexes for hot filters/order clauses.
   - Use pagination instead of loading full lists.
   - Keep last-known-good cached data while refreshing.
   - Make optional data fail locally, not globally.
   - Scope invalidation to exact keys/tags/sections.
   - Remove fallback writes and broad reset logic.

5. Keep timeouts only as guardrails.
   - A timeout may prevent infinite loading, but it must show unconfirmed/degraded state.
   - Never show fallback `0`, empty list, disabled feature, English language, or Free plan as confirmed database state.
   - Retain previous valid state if a refresh fails.

6. Verify the regression boundary.
   - Test the failing surface.
   - Test login/auth still succeeds when optional reads fail.
   - Test sidebar/history/features remain usable when one page request fails.
   - Test native bootstrap preserves session, language, and feature state under partial backend failure.
   - Run relevant typecheck/lint/build checks before pushing.

## Project-Specific Rules

- Auth must depend only on token/session validation and minimal user identity.
- Admin writes must not invalidate user-facing routes unless there is a specific proven dependency.
- Feature settings, translations, pricing, billing, forum, chat history, and prompts must not share one global loading state.
- If admin data cannot be confirmed, show unconfirmed/degraded UI, not fake zeroes.
- If feature settings cannot be read, do not silently disable sidebar features.
- If translation dictionaries cannot be refreshed, do not reset the selected language or clear the session.
- If a user-facing API fails, do not clear native cached bootstrap unless lightweight session validation confirms the token is invalid.

## Required Final Report

When finishing this kind of work, include:

- The measured cause, not just the symptom.
- The code path changed.
- What changed structurally to reduce or remove the timeout.
- What timeout/fallback remains only as containment.
- Tests or checks run.
