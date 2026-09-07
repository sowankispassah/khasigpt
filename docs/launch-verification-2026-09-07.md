KhasiGPT launch follow-up verification — 7 September 2026

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
