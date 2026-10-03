---
name: new-feature-admin-default
description: Use when adding, exposing, gating, or reviewing a new KhasiGPT feature, feature flag, admin feature-access control, sidebar/menu feature entry, native/mobile/web feature availability field, or AppSetting-backed feature toggle. Ensures every new feature is admin-only by default until an admin explicitly enables it for all users.
---

# New Feature Admin Default

## Overview

New user-facing features must be visible only to admins by default. Do not launch a new feature as enabled for every user because a setting row is missing, unreadable, stale, or unavailable.

## Required Default

- Use `admin_only` as the fallback/default access mode for every newly added feature flag.
- If a database row is missing, treat the new feature as `admin_only`, not `enabled` or `disabled`.
- If a feature access read is unavailable or stale and there is no confirmed value, do not fail-open to all users for the new feature.
- When the feature should ship immediately to admins, write or migrate an explicit `admin_only` `AppSetting` row when appropriate.

## Feature Access Checklist

When adding a new feature flag, update all applicable feature access surfaces together:

- Add the setting key in `lib/constants.ts`.
- Add the key to `lib/db/app-setting-validation.ts` so only valid feature access modes can be saved.
- Add the key and allowed admin write source in `lib/settings/feature-setting-guard.ts`.
- Add the admin field metadata in `lib/settings/feature-access-settings.ts`.
- Add the admin save field config in `app/api/admin/feature-access/route.ts`.
- Render the admin control in `app/(admin)/admin/settings/page.tsx` if admins should manage it.
- Use a parser/fallback in the feature config module with `admin_only` as the fallback.
- Include the feature in web/mobile/bootstrap read models only after applying the same admin-only default.

## Save Behavior

- Admin feature controls must save through `/api/admin/feature-access` or the established guarded feature-setting writer.
- Keep admin write sources specific, such as `feature.my_feature.toggle`.
- Do not bypass `assertFeatureSettingWriteAllowed` for feature access settings.
- Keep DB writes bounded and section-scoped; avoid unnecessary pre-read/write/readback waterfalls.
- Show one clear terminal toast per save attempt. Do not stack slow-warning error toasts behind final save errors.

## Verification

- Confirm missing setting rows resolve to admin-only access for the new feature.
- Confirm admin users can access and regular users cannot until the setting is changed to `enabled`.
- Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build` for route, config, or admin UI changes.
