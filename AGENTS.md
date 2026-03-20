# Agens App Engineering Standards

These instructions are specific to this repository. Follow the existing App Router architecture instead of introducing parallel patterns.

## 1. Build Inside the Current Shell Architecture
- This app is organized under `app/` route groups such as `(public)`, `(auth)`, `(chat)`, `(admin)`, `(calculator)`, plus shared routes like `about`, `forum`, and localized `[lang]` pages.
- Cross-route UI belongs in the shared shell layer, not in individual pages. Use `components/site-shell.tsx` and `components/site-shell-extras.tsx` for app-wide client extras.
- The root progress system already lives in `app/layout.tsx` through `components/global-progress-bar.tsx`. Reuse it instead of creating a second loader.
- Put shared UI in `components/`, domain logic in `lib/`, and route-specific composition in `app/`.

## 2. Persistent User Menu Is a Shell Requirement
- The user menu must remain available on every user-facing route that uses `SiteShell`.
- The canonical implementation is `components/page-user-menu.tsx`, mounted through `components/site-shell-extras.tsx`.
- Do not duplicate dropdown implementations per page. Extend `PageUserMenu` or `UserDropdownMenu` when behavior changes.
- If you add a new layout that should behave like the rest of the app, it must wrap its children with `SiteShell` so the persistent menu remains consistent.

## 3. Click Feedback Must Be Instant
- All interactive controls must show `cursor-pointer` or an equivalent explicit hand cursor. Do not rely on browser defaults.
- Navigation and async actions must trigger immediate visual feedback. Use the existing global progress event helpers in `lib/ui/global-progress.ts`.
- New route-changing controls should either use normal navigable elements already picked up by the global progress listener, add `data-nav`, or call `startGlobalProgress()` and `doneGlobalProgress()` directly when needed.
- Keep loading feedback optimistic and immediate. Buttons, menus, and dialogs must expose busy and disabled states while work is pending.
- Do not introduce full-page blocking spinners for ordinary navigation when the top progress bar or local pending state is sufficient.

## 4. Performance Rules for a Production-Scale App
- Default to Server Components. Add `"use client"` only when browser APIs, client state, or interactivity require it.
- Keep client islands small. Heavy client features should be dynamically imported, following the existing pattern in files like `components/site-shell-extras.tsx`, `components/root-client-extras.tsx`, `components/message.tsx`, and `components/chat.tsx`.
- Keep shared layouts fast. In route layouts, fetch only what is required for first render, run independent reads in `Promise.all`, and add timeouts on slow dependencies for auth, settings, and profile lookups.
- Prefer `next/image` for user-visible images and media thumbnails. Do not add raw `<img>` tags unless there is a specific technical reason.
- Use App Router caching intentionally. For reusable read paths, prefer existing patterns around `unstable_cache`, `revalidateTag`, cache tags, and explicit HTTP cache headers.
- Do not make routes dynamic unless cookies, headers, auth, or live data truly require it. Public marketing-like pages should stay as static as possible.
- For large lists or data-heavy UIs, use pagination, incremental loading, virtualization, or deferred panels instead of rendering everything up front.
- Avoid extra dependencies for problems already covered by the platform, existing utilities, or the current component stack.

## 5. Data Layer and Database Changes
- Database schema lives in `lib/db/schema.ts`, migrations live in `lib/db/migrations/`, and query logic belongs in `lib/db/queries.ts` or the relevant domain service under `lib/`.
- Use Drizzle consistently for application query code. Keep hot-path queries indexed and avoid N+1 access patterns.
- Schema changes require a real migration. Manual data creation does not. When a task requires inserting or updating data manually, provide the SQL statement instead of instructing someone to run `npm exec tsx lib/db/migrate.ts`.
- Any new query added to a hot API path, auth callback, middleware path, or layout must be reviewed for latency, cacheability, and index coverage.

## 6. Security and Production Hardening
- Secrets stay in `.env` and must never be committed or exposed to the client.
- Treat `proxy.ts`, `app/api/**`, `app/(auth)/auth.ts`, `lib/security/**`, and `next.config.ts` as the enforcement layer for auth, rate limiting, redirects, CORS, headers, and site gating. New protected behavior should integrate there instead of bypassing it.
- Validate and sanitize all external input before using it in queries, rendered output, uploads, or redirects. Prefer shared helpers and schema validation over ad hoc parsing.
- Do not trust client role checks. Authorization must be enforced on the server in route handlers, server actions, middleware, or query boundaries.
- Keep logs free of secrets, tokens, raw payment payloads, and private user content.
- New API routes must consider rate limits, cache headers, auth requirements, and payload minimization from day one.

## 7. High-Scale Delivery Expectations
- Optimize for low-latency first paint and fast route transitions, especially in chat, jobs, forum, admin, and profile flows.
- Preserve streaming and incremental rendering where already present. Do not regress the perceived speed of chat or dashboard screens with synchronous client work.
- Prefer resilient fallbacks over hard failures for non-critical reads in layouts and middleware, but do not silently hide data integrity issues.
- Add or update targeted tests when changing auth, billing, admin, job ingestion, middleware, or shared shell behavior.
- Before shipping meaningful changes, run the relevant checks from `package.json`: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a production build when the change affects rendering, config, or routing.
