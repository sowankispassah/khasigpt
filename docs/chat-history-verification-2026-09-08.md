# Saved chat reopening verification — 2026-09-08

## Confirmed defect and fix

Returning from `/chat/:id` to blank `/chat` retained the previous dynamic route parameters in the persistent sidebar. The old conversation remained highlighted and its duplicate-navigation guard discarded subsequent clicks. The current pathname now determines the active chat, preserving the separate `chatId` query used by embedded chat flows.

Application commit: `a9fa1f309274f895e6beb25bd0b3c164bc66eaf6`, branch `codex/instant-chat-submit`, PR 18. No schema change.

The production-build regression test failed against the previous application with `data-active="true"` on the blank page, then passed after the fix. It creates a disposable conversation, loads its saved route, returns using the persistent shell logo, and verifies the same history item opens with its saved response and usable composer.

## Validation

- Isolated production build: 18 browser tests passed, one existing entitlement test skipped. Covers history reopening, server-visible startup, optional-data failure and session navigation.
- Clean release checkout: lint passed across 767 files, TypeScript passed and production build passed.
- Logs: `tmp/history-reopen-baseline.log`, `tmp/history-reopen-fixed.log`, `tmp/history-release-lint.log`, `tmp/history-release-types.log`, `tmp/history-release-build.log`.
- This focused run does not change the full-suite limitations recorded in `chat-startup-verification-2026-09-08.md`.

## Live observations before deployment

Signed-in Chrome measurements timed a sidebar click until an assistant message was visible and the composer enabled. Existing conversations were only read; no production generation or wallet charge was triggered.

| Sample | Ready after click |
| --- | ---: |
| Simple saved text conversation | 1,691 ms |
| Richer shopping conversation, first sample | 8,404 ms |
| Same richer conversation, later sample | 1,582 ms |

The later richer sample had two route resources taking 805 ms and 751 ms; vote and prompt requests took about 337–339 ms. This does not establish the cause of the earlier 8.4-second sample. Another fresh tab had history and prompt requests abort after approximately 15 seconds; reloading recovered. These transient failures must remain part of the assessment. A deployment log window also caught an unrelated `/api/jobs/list` fetch failure.

These are small local samples with no network/CPU throttling, not field percentiles, capacity results, or proof that uncached history always opens quickly.

## Production delivery and post-deploy checks

Application commit `a9fa1f3` is READY on `https://khasigpt.com` as deployment `dpl_2ERX5Snb3Q6RK2jryhqv8Zhdj86C` (`https://khasigpt-193ogym7o-soowankis-projects-9af25d9d.vercel.app`, hnd1). Rollback: `dpl_449uzVKwg18sYMwMzDdVKdGbqRxv`. The public launch switch was not changed.

Live verification loaded a saved conversation, used the logo to return to blank chat, and confirmed its history link was no longer active. Selecting that same conversation restored its message and enabled composer in **122 ms on desktop** and **66 ms with a mobile viewport override**. The mobile history drawer closed after selection. Both are cached reopen samples, not first-load or native timings. Browser automation initially timed out before one mobile click; the page remained blank with the drawer open, and the next verified click completed. The viewport override was restored.

Fresh deployment logs still recorded one 805 ms launch-gate database deadline on the saved-chat route and an unrelated jobs-list fetch failure. The reopened conversation remained usable. These are unresolved production reliability observations; this fix is not an unconditional cold-start or launch sign-off. Logs: `tmp/history-after-runtime.jsonl`.

## Native scope

Reviewed `native/src/screens/ChatScreen.tsx`: `openChat` always selects the requested conversation, restores its memory cache immediately, and refreshes through `loadChatPage`. Persistent cached messages can also display before the network response; request IDs prevent superseded requests from overwriting another conversation. The empty-state spinner does not replace populated cached messages. This handler has no matching active-route suppression defect, so no native source or new release was needed for this fix.

The existing native artifact remains 0.1.166/v166. ADB reported no connected devices during this check; native history timing and device behavior are not claimed verified here.

Unrelated root changes (`next-env.d.ts`, `tsconfig.tsbuildinfo`, `.codex-remote-attachments/`, `remotion/`) remain excluded from the application commit.
