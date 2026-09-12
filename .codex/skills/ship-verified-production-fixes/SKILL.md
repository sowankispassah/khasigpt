---
name: ship-verified-production-fixes
description: "Use when a user explicitly asks to fix, optimize, harden, or make a KhasiGPT behavior work in production, especially Admin Console performance, reliability, loading, database, Vercel, Supabase, or production regression work. Ensures verified code is not left only in the local worktree: scope it, commit it, push it, deploy the intended source state, and verify production unless the user explicitly requests local-only work or withholds deployment authority."
---

# Ship Verified Production Fixes

Finish production-targeted fixes end to end. A configuration-only redeploy does not complete a task when a verified code refactor is still local.

## Required workflow

1. Identify the exact files belonging to the requested fix. Preserve unrelated dirty-worktree changes and stage explicit paths only.
2. Run the closest targeted tests, typecheck, lint/format checks, and a production build when rendering, routing, server, database, or configuration behavior changed.
3. Create a `codex/` branch when currently on the default branch. Use the existing task branch otherwise.
4. Commit the complete verified fix, including targeted tests and directly relevant operational safeguards.
5. Push the branch with upstream tracking and open a draft pull request unless the user requested a different review flow.
6. Deploy the exact verified source state to Vercel production when the original request explicitly targets production or live behavior. Do not substitute a redeploy of older code for deploying the completed fix.
7. Verify the deployment reaches `READY`, exercise a safe representative production path, and inspect fresh runtime errors and logs for the deployed ID.
8. Report the branch, commit, pull request, production URL, checks, measured post-deploy behavior, and unrelated files deliberately excluded.

## Safety boundaries

- Do not claim completion while required code remains uncommitted or undeployed.
- Do not stage generated or unrelated files merely because they are dirty.
- Do not deploy if the user asked for diagnosis, review, a report, or local-only changes.
- Do not skip failed checks. Fix failures or report a concrete blocker.
- Do not expose secrets while pulling, validating, or updating environment variables.
- Prefer deploying a tested commit. If a direct Vercel deploy is required, verify that its packaged files match the intended commit and exclude unrelated worktree changes.
- Keep rollback information available and scan post-deploy logs before declaring success.

## Completion rule

The task is complete only when the requested code state is verified locally, published to GitHub, live in the intended production deployment, and checked after deployment, or when a specific external blocker is reported.
