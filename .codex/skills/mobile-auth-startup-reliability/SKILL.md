---
name: mobile-auth-startup-reliability
description: Use when changing native or web login, mobile bootstrap, app startup hydration, feature flags, translations, billing/image credits, admin settings, cache invalidation, or any global state path in this repository. Ensures auth stays isolated from optional data and one failing request cannot break login, language, sidebar, chat history, or the app shell.
---

# Mobile Auth Startup Reliability

## Core Rule

Authentication is the critical path. It may depend only on token/session validation and minimal user identity. It must not wait for feature flags, translations, pricing, billing, image credits, prompts, sidebar items, chat history, forum data, admin settings, model settings, or any other optional startup data.

If a user token is valid, the native app must enter the authenticated shell even when every optional startup request is slow, degraded, or failed.

## Startup Phases

1. Auth check: read stored token, validate `/api/mobile/auth/session`, and apply `session.user`.
2. Minimal shell: render navigation and core chat with cached or local shell data.
3. Startup bootstrap: fetch small read models in the background with section-level failure handling.
4. Full hydration: fetch billing, pricing, prompts, translations, feature details, and other non-critical data after the shell is usable.

Do not merge phases 1 and 4. Any code that makes login wait for full hydration is a regression.

## Native Auth Rules

- `signInWithEmail`, Google sign-in completion, and stored-token restore must set the session before optional bootstrap starts.
- Do not clear `session`, auth token, or cached shell data because `/api/mobile/bootstrap`, `/api/mobile/features`, `/api/mobile/i18n`, forum, billing, or image-credit requests fail.
- A 401/403 from an optional endpoint must be confirmed with the lightweight session endpoint before signing the user out.
- Keep the previous valid bootstrap while refreshing. Never replace it with empty fallback data.
- If no bootstrap exists, create a minimal authenticated shell snapshot from the session and local language preference.
- `isBootstrapRefreshing` is for local skeletons only. It must not control whether the user is authenticated.

## Backend Auth Rules

- `/api/mobile/auth/login` and `/api/mobile/auth/session` must stay small and read only user identity/session data.
- Do not import billing, image credits, feature settings, translations, pricing, prompts, or admin config into auth routes.
- Protected mobile routes should use the shared auth helper, but optional route failures must not mutate auth state.
- Logs must distinguish auth failures from optional data failures.

## Optional Data Isolation

- Feature flags, translations, sidebar features, chat history, pricing, billing, forum, jobs, RAG, prompts, and image credits must have separate endpoints, cache keys, loading states, and errors.
- One optional endpoint failing must not clear global bootstrap, selected language, session, sidebar history, or feature settings.
- Section fallbacks are render-only. They must never be persisted to the database.
- UI must distinguish confirmed DB values from loading, cached, stale, fallback, and failed states.

## Cache And Invalidation Rules

- Admin mutations must invalidate only the affected read model or tag.
- Avoid broad `revalidatePath("/")`, global bootstrap invalidation, root layout refreshes, or shared cache resets after admin writes.
- Cached bootstrap data is last-known-good state. Preserve it while revalidating.
- Empty arrays and fallback objects are not authoritative unless the backend explicitly marks them confirmed.

## Feature Flags And Image Credits

- Feature access controls whether a feature is visible/usable.
- Credits control whether a paid action can be submitted.
- Do not use image-credit failures to disable feature settings, reset sidebar features, or block login.
- Image generation may enter prompt mode before credit verification, but send/submit must verify credits and show a local modal if insufficient.
- User-facing code must not write feature settings or admin config as a side effect of billing, recharge, purchase restore, or credit checks.

## Translation Rules

- Language selection and translation dictionaries are optional startup data after auth.
- Store the selected language locally first for instant startup.
- A failed translation edit, dictionary refresh, or language bundle request must not reset the active session or feature state.
- Stale async language responses must not overwrite a newer selected language.
- UI labels must use display names, not provider/internal codes.

## Database And Migration Safety

- Schema changes need migrations under `lib/db/migrations/` and matching `lib/db/schema.ts` updates.
- Prefer additive, backward-compatible fields with safe nullable/default behavior.
- Normal app requests must not run seeding or default-writing logic that can overwrite admin settings.
- Upserts must target the exact key/constraint and must not replace full settings blobs for single-field updates.
- Before deployment, test old code against new schema and new code against partially populated data when practical.

## Required Logging

Log these events without secrets or private user content:

- native auth: sign-in started, token received, session applied, shell bootstrap created, optional bootstrap started/failed/applied
- backend auth: endpoint duration, user lookup duration, session validation duration
- bootstrap: section start/end/error/degraded/fallback and timeout source
- feature settings: key, previous value, new value, writer route/action, cache invalidation target
- translations: language, key, writer source, bundle invalidation target, dictionary refresh result
- billing/image credits: balance read duration, submit-time credit decision, modal decision

## Regression Checklist

Run this checklist before shipping changes touching auth, bootstrap, settings, translations, billing, image credits, or global state:

- Fresh native login with email reaches the app shell before optional data finishes.
- Google login reaches the app shell before optional data finishes.
- Reopen app with stored token does not flash login for a valid session.
- Simulated `/api/mobile/bootstrap` failure does not log out the user.
- Simulated feature API failure does not hide chat history or reset language.
- Simulated i18n failure does not switch visible UI back to English when cached Khasi exists.
- Image-credit denial shows a local modal on submit, not a login or startup failure.
- Admin feature/pricing/translation saves do not invalidate unrelated user-facing routes.
- Sidebar history loads even when feature settings, forum, or image metadata fail.
- No save/update flow writes fallback settings to the database.
