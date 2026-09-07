KhasiGPT launch follow-up verification — 7 September 2026

Latest follow-up (supersedes the outstanding native-install/full-suite items below):

- The user confirmed installation and release testing of the native fixes is complete. Release 0.1.165/v165 was built and published in the native repository as d922cd6. This is user-confirmed device validation, not a new automated device run.
- The full isolated Playwright suite passed with retries disabled: 288 passed, 23 existing skips, 5.1 minutes. Focused tests passed 237/237. The jobs HTTP fixture now reads the disposable local SQL jobs table; existing jobs migrations and language fixtures are applied locally. No production service credentials are used. Vector retrieval, real Supabase REST behavior and real provider calls remain outside that isolated suite.
- The image test now waits for the completed upload and actual attached-file control before sending. Session tests honor the configured test origin. The guest route honors its sanitized destination for an existing session. Invite params use the current asynchronous route contract, and resumable-stream state moved out of a route module with an invalid public helper export.
- Repeated Webpack-dev 500 responses were traced to Next's load-manifest.external.js parsing a partially written manifest before application authorization. Isolated tests now use Turbopack, matching the production build pipeline; authorization assertions remain unchanged.
- Paid text calls compute a maximum output allowance from the admitted wallet balance, full input allowance and frozen pricing. Low balances stop before the model adapter is called. Text uses a conservative UTF-8 allowance; Google media uses countTokens, while supported OpenAI/Anthropic image calls use a deliberately conservative visual allowance. Unquoteable media fails before generation. SDK retries are disabled on these calls.
- Search reserves the bounded Serper request cost before invocation, including shopping units and fallback attempts. Paid grounding adapters without a hard call bound use the existing fallback path without starting their paid request. This means paid Gemini grounding is temporarily unavailable; a configured, affordable Serper fallback can still run. Explore now shares paid-generation admission. Live voice remains admin-only.
- An image submission freezes a one-image quote, admits only a sufficient wallet, delivers one image and settles that quote. Extra returned provider files cannot silently increase the purchase quantity. The automatic Nano Banana retry was removed. The SQL concurrency harness verified that increasing text/image prices tenfold during generation still settles the original combined 30-unit quote.
- These are configured customer-pricing safeguards, not a guarantee that provider invoices exactly match administrator-entered prices. Real-provider media counting, hidden provider costs, failed-call costs, credit-expiry boundaries and streaming interruption still need staging reconciliation. The existing capped-settlement fallback is retained as a final protection against a negative wallet.
- Production traffic capacity has not been measured. A bounded authenticated HTTP read-load runner and a staging procedure are in traffic-capacity-test.md. Its scheduling/reporting were tested against a local fixture (10 successful requests); that fixture result is not a capacity benchmark.

The follow-up passed TypeScript and a production build from the isolated release checkout. That checkout's lint check passed across 761 files with no errors or warnings. Its dependencies were installed from the frozen lockfile; no unrelated Remotion or native changes are included. Deployment verification is recorded below after completion.

Backend commit bcdf3787d2aa9042b75596f90931a3ec85407466 was deployed from a clean detached checkout. Vercel deployment dpl_H4tuwbRgHwovrzyGDxLqqiHq79AY reached READY and owns khasigpt.com, www.khasigpt.com and khasigpt.vercel.app. Its recorded gitCommitSha matches the verified commit. Deployment URL: https://khasigpt-5aaj8f22n-soowankis-projects-9af25d9d.vercel.app.

The clean checkout passed pnpm lint (753 files, no errors or warnings). It excluded unrelated root Remotion work, native's separate repository, attachments, environment files and generated build state. The root production build, both TypeScript checks, 229 focused web tests, 42 native tests and Android JS export had already passed. Native fixes are published as 6bab15c on draft PR #3; a new signed Android release was not built or installed.

Production read-only/unauthenticated smoke results:

| Endpoint | Result |
| --- | --- |
| / | 200 after redirects; follow-up round trip including HTML body 2916 ms |
| /api/auth/session | 200, 755 ms |
| /api/public/site-launch | 200, confirmed:true, degraded:false, 754 ms |
| /api/mobile/bootstrap | 200, 788 ms |
| /api/jobs/list | 401 without authentication |
| /api/chat/voice-token and /api/mobile/chat/voice-token | Both 401 without authentication |
| /api/live-translation/token and /api/mobile/live-translation/token | Both 401 without authentication |
| /api/translate/live-token | 401 without authentication |

These are a small number of network observations from the audit machine, not latency percentiles or capacity guarantees. The first probe mistakenly requested the nonexistent /api/site-status path and received 404; the corrected /api/public/site-launch probe above passed. No authenticated paid generation or gateway payment was performed in production.

Deployment-scoped fresh error logs contained one middleware site-status internal-fetch timeout on the initial GET / (307). The later direct site-launch check returned confirmed healthy settings. The error scan was therefore not clean: cold status-fetch latency still reaches the existing fail-closed fallback. No other error/fatal entry appeared in the two short deployment-scoped scans. This observation must not be represented as proof of zero runtime errors or a fixed public-load SLO.

The user connected a Xiaomi M2007J20CI device. Installed package khasigpt.com reported version 0.1.164, versionCode 164. A cold activity launch measured 959 ms; an explicit process stop/relaunch measured 572 ms; a background/resume measured 205 ms. These Android activity timings are not API completion or full interactive-render timings. The signed-in home screen was visible, and Android reported no ANR since boot.

Automated input initially failed because Android's USB debugging security permission blocked INJECT_EVENTS. After the user enabled it, text entry succeeded. One capture showed the keyboard covering the composer; this remains a possible defect requiring a stable post-animation reproduction, not a confirmed root cause. An unsent "Audit lifecycle draft" was entered for the test. The device disconnected during the offline/background test after Wi-Fi was disabled, preventing restoration and the final screenshot. The user was immediately asked to reconnect USB and restore Wi-Fi. Mobile data was already off and was not changed. Device verification remains partial; the installed 0.1.164 binary is not evidence that the newly committed native JavaScript fixes were installed.

Rollback: the previous production deployment is dpl_8cmG2BHFvsbqnb6erGQtru8TsSnh at khasigpt-5cprhtsiy-soowankis-projects-9af25d9d.vercel.app. If needed, point production back to that deployment using Vercel rollback. Leave the additive PaidGenerationLease table in place during application rollback; older code does not reference it. All five live access settings were already admin_only before the authorized reaffirmation and remain admin_only. Do not re-enable public live sessions without trusted server metering and a reviewed release.

See production-readiness-audit-2026-09-06.md for the complete audit, concurrency matrix, full-E2E limitations and remaining launch risks. Current assessment: backend safeguards deployed and verified within the stated scope; unrestricted launch certification remains withheld.

Connected-device retest after USB was restored (7 September, approximately 11:40–11:44 IST):

- Wi-Fi was already enabled when the device reconnected. The installed version remained 0.1.164. Cold activity launch measured 1113 ms; background/resume with an unsent draft measured 196 ms. The signed-in screen and draft survived that background/resume cycle.
- After allowing the keyboard animation to finish, the composer, entered draft and send button were all visible above the keyboard. The earlier capture does not establish a persistent keyboard defect; no speculative layout change was made.
- A short offline test disabled Wi-Fi while mobile data was off, backgrounded/resumed the app and opened the sidebar. Cached navigation/history remained visible and responsive. Wi-Fi was restored in a finally block and read back as enabled; mobile data remained off. This does not verify an in-flight generation interrupted by network loss.
- Microphone permission was temporarily revoked to exercise the denial flow. Android displayed its permission prompt; selecting Don't allow led to the app's explicit microphone-permission message and a terminal voice error with cancel/retry controls. Both cancel controls returned to the home screen. Microphone permission was granted again and verified. No live audio session or provider generation was started for this check. This device's package manager does not expose the clear-permission-flags command; its diagnostic USER_FIXED flag appeared after denial, while the effective permission was restored to granted=true.
- The audit draft was cleared. The final capture shows the normal home screen with an empty composer and no open voice/permission dialog. Android still reported no ANR since boot. Screenshots are retained locally under tmp/launch-device-* and are not committed because they contain account UI.

These checks replace the earlier USB-blocked status for keyboard, basic offline recovery and microphone denial/cancellation. They validate the existing installed binary only. Installation of the newly committed native fixes, active live-session background/cancellation, process death during generation and production capacity remain separate release checks.
