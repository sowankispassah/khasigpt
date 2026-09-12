# Chat startup verification — 8 September 2026

## Delivered changes

Web application commits `13296e3` and `b6cc062` replace the hydration-effect import in `components/chat-loader.tsx` with an SSR-enabled Next dynamic import. The chat stays split from unrelated routes, but its chunk can be preloaded and its greeting/composer streamed before hydration. `components/greeting.tsx` no longer hides its text behind a mount timer and opacity animation. Composer controls remain disabled until their handlers attach, preventing lost early typing and attachment clicks. Existing optimistic chat IDs, translations and feature checks remain.

Native commit `854db87` defers unopened screens through React Navigation's `getComponent`: main tabs, auth routes, profile completion and job details. Previously these imports initialized unrelated screen dependencies before chat. Launch checks, cached-session restoration, fonts, feature gates and screen geometry are unchanged. This reduces module initialization on startup; it does not reduce the installed bundle size.

## Live browser evidence

Production source `b6cc062153a8f6811c4a3362a9e8fa90867edddf` is READY at `https://khasigpt.com`, deployment `dpl_449uzVKwg18sYMwMzDdVKdGbqRxv` (`khasigpt-o4m1p3e7a-soowankis-projects-9af25d9d.vercel.app`), in Tokyo (`hnd1`). Rollback: `dpl_4Jfh1eqX51UywGwMQHvj9JQMjnP9`.

Measurements used an existing signed-in Chrome admin session in a separate temporary tab. No messages were sent. The original tab was preserved. No CPU or network throttling was applied; a browser extension was active. These are small local samples, not population percentiles or capacity measurements.

| Sample | TTFB | First contentful paint | Largest contentful paint |
| --- | ---: | ---: | ---: |
| Before: first chat load | 1,773 ms | 1,960 ms | 4,076 ms |
| Before: repeat | 1,104 ms | 1,292 ms | 2,272 ms |
| After: desktop repeat 1 | 1,619 ms | 1,984 ms | 2,368 ms |
| After: desktop repeat 2 | 1,202 ms | 1,676 ms | 1,844 ms |
| After: desktop browser cache disabled | 833 ms | 1,540 ms | 1,540 ms |
| After: 390 × 844 mobile viewport | 1,401 ms | 1,708 ms | 2,576 ms |
| After: mobile viewport repeat | 1,427 ms | 1,660 ms | 2,192 ms |

The initial post-deploy navigation stalled: TTFB was 2,975 ms, the document remained incomplete, and several resources recorded approximately 20-second durations. Reloading recovered. The deployment-scoped five-minute log window contained one launch-gate database deadline at 805 ms on `/chat`; causation of the navigation stall is not established. Do not describe this as uniformly fast cold-start behavior or omit the failed sample.

Mobile-width checks confirmed the greeting, enabled composer and no horizontal overflow (390 px client/scroll width). A draft was entered and cleared. Mobile viewport emulation does not measure Android native startup.

## Native artifact

Version **0.1.166**, versionCode **166**, signed AAB:

- `native/builds/khasigpt-0.1.166-v166-playstore.aab`
- `native/android/app/build/outputs/bundle/release/khasigpt-0.1.166-v166-playstore.aab`

SHA-256: `30B00BF99CD1324F6BE9326E7167D069F3B085899CF6AC81FF925EB7D034AABE`.

Native tests: 44 passed, including executing both real navigators with platform stand-ins to prove registering routes initializes no screen modules and requesting a deep-link target loads its screen. Native TypeScript and `bundleRelease` passed. `jarsigner -verify` reported `jar verified`, with the existing self-signed certificate/timestamp warnings. Source was pushed to the native task branch and fast-forwarded to `main`. No connected USB device was detected; this version has not been installed or timed on a device during this task, nor uploaded to Play Console.

## Web validation and boundaries

Clean-checkout lint passed across 765 files; TypeScript and production build passed. Focused browser tests passed 14 with 5 existing skips. They cover server-visible chat with client bundles blocked, controls becoming usable after hydration, failed optional history/prompts, suggestions, attachments, streaming/stop, votes and URL-query messages.

The full development-server run passed 294 with 23 skips and one responsive-test failure caused by a missing generated development chunk. Reusing the development cache also produced spurious auth-route 404s. The isolated runner now removes only its verified disposable output directory and supports a production-build run. Its local production server forwards the configured CSP into rendering, matching the observed deployed nonce attributes while keeping browser CSP enforcement enabled. Production-mode tests use explicit guest/launch fixtures in the disposable local database; no production setting is changed.

The expanded production-build suite exposed additional test-environment limitations: authenticated redirects used the custom server's default port (corrected to the configured port); the responsive test's console assertion caught an existing inline-theme CSP violation and the locally unavailable Vercel analytics script; a jobs test exhausted its fixture's production credit allowance. The initial run reported 280 passed, 6 failed, 19 skipped and 13 not run. Do not call the full suite green. After the port correction, the production-build chat, first-render, reasoning-availability and session suite passed **29 tests with 9 existing skips** (`tmp/chat-startup-production-browser-final.log`). No security policy or wallet limit was weakened to make those checks pass.

Provider calls in automated tests use fixtures. Neither these tests nor the live page timings validate production traffic capacity. To reproduce the production build locally with disposable data: set `AUDIT_DATABASE_URL` to a local `khasigpt_audit_...` database, set `AUDIT_PRODUCTION_BUILD=1`, and run `pnpm test:isolated --retries=0 --reporter=list`. `AUDIT_PRODUCTION_BUILD=reuse` reuses an existing isolated build only; rebuild after application changes.

Unrelated root changes (`next-env.d.ts`, `tsconfig.tsbuildinfo`, `.codex-remote-attachments/`, `remotion/`) were excluded from source commits and deployment.
