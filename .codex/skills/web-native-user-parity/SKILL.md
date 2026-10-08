---
name: web-native-user-parity
description: Use whenever creating, changing, removing, fixing, or reviewing a KhasiGPT user-facing web interface or feature (screens, menus, wording, translations, icons, states, behavior). The matching native Expo/Android change and a new signed release AAB are part of the same task by default, even when the request mentions only web and without the user asking. Do not use for Admin Console, internal tooling, or backend-only work with no user-visible effect.
---

# Web–Native User Parity

Keep KhasiGPT's user-facing web app and native mobile app functionally and visually consistent. A user-visible web change is incomplete until its native equivalent has been inspected and, when applicable, implemented in the same task, and until a new release AAB carrying the native change is ready for upload.

The user should never have to ask "do it on mobile too" or "make a new release". If they have to, this skill was not followed.

## Required scope

Apply this skill to changes affecting anything an ordinary user can see or use, including:

- screens, routes, navigation, menus, headers, dialogs, forms, cards, controls, and responsive layouts
- chat, history, image generation, voice, authentication, subscriptions or credits, profile, settings, forum, jobs, calculator, resources, and other user sections
- feature availability, permissions, feature flags, API-backed actions, state management, persistence, and session behavior
- loading, streaming, empty, disabled, success, error, retry, refresh, keyboard, scrolling, and back-navigation states
- user-facing wording, translations, icons, colors, typography, spacing, motion, and accessibility behavior

Do not apply it to:

- Admin Console or routes and components used only under `/admin`
- internal operations, migrations, observability, developer tooling, or tests with no user-facing product effect
- backend-only refactors that intentionally preserve every user-visible contract

If shared backend or API work changes a user-visible contract, this skill applies to every affected web and native consumer.

## Parity rule

When changing a user-facing web feature or interface:

1. Locate the web implementation and its native counterpart before editing. Inspect related routes or screens, components, hooks, services, API calls, feature gates, state, translations, and styles on both sides.
2. Include the native implementation in the current task automatically. Do not wait for the user to separately request mobile parity.
3. Match the complete user contract, not merely the happy-path control:
   - availability and role or subscription gating
   - labels, translations, actions, menus, and confirmations
   - loading, empty, disabled, success, error, retry, and offline behavior
   - navigation, back behavior, keyboard handling, scrolling, refresh, session state, and persistence
4. Reuse shared APIs and product rules where possible. Avoid creating web-only and native-only behavior for the same product capability without a platform reason.
5. Adapt presentation to established mobile conventions rather than copying CSS literally. Functional meaning, information hierarchy, visual identity, and available actions must remain equivalent.
6. If the native feature does not exist, implement the reasonable native equivalent instead of silently omitting it. If a direct equivalent is technically impossible or inappropriate on Android, provide the closest platform-appropriate experience and report the concrete limitation.
7. Apply the same requested change on both platforms and nothing more. Do not remove, restyle, or rework other controls the user did not mention, even if they now look inconsistent; suggest such changes instead of shipping them. For example, "make the label say Light mode while dark" means change the label and keep the existing toggle.
8. Search the native app for every place that renders the same thing before editing. Native screens sometimes keep their own copy of a menu or header (for example `PageHeader.tsx` plus screen-level menus), and all copies must change together.

The reverse also applies when the task intentionally changes an existing native user-facing contract: inspect the corresponding web experience and prevent unnecessary divergence.

## Repository guidance

- Web implementation normally lives under `app/`, `components/`, `hooks/`, and `lib/`.
- Native implementation lives under `native/`; prefer its shared components, hooks, services, navigation patterns, and theme tokens over screen-specific duplication.
- Follow applicable native skills for shared headers, Android safe areas, keyboard-safe inputs, authentication startup, translation coverage, and Play Store versioning.
- The default native verification and release target is Android. Do not perform iOS-specific build or release work unless the user explicitly requests it, but keep shared Expo code portable where practical.

## Verification

Before declaring the task complete:

1. Verify the changed web flow at responsive widths and the matching native Android flow.
2. Run targeted tests for both implementations plus their relevant typecheck, lint, and build checks.
3. Compare visible controls and all meaningful states, not only initial rendering.
4. State which web and native files changed and describe any intentional platform-specific differences.

Do not claim parity based only on matching names, API endpoints, or the existence of a native screen.

## Delivery: release without being asked

The native app has no over-the-air updates, so a native change does nothing for users until a new AAB is installed. When the task changed shipped native code:

1. Push the web change to the web repository's `main`.
2. Push the native change to the native repository's `main`.
3. Build a new signed release AAB with a bumped version, following [native-playstore-release-versioning](../native-playstore-release-versioning/SKILL.md). Put the versioned file in the upload folder `native/android/app/build/outputs/bundle/release/` and the archive copy in `native/builds/`.
4. Push the version bump to native `main`.
5. In the final report, give the upload-folder AAB path and the commit for each repository.

Before ending the turn, check the following. Any "no" means the task is not done:

- Did a user-facing web change get its native counterpart (or a stated reason why not)?
- Did every native copy of the changed UI change?
- Is a new versioned AAB in the upload folder, with the bump pushed to native `main`?

## Boundaries

- An explicit user instruction to limit a task to web-only or native-only, or to hold off on a release, overrides this default.
- Building the local signed AAB is part of the task. Uploading it is not: never upload to Play Console, publish a track, submit for review, or roll out. The user does that manually.
- This skill does not by itself authorize web deployment beyond pushing to `main`, database mutation, or other external actions.
- Preserve unrelated worktree changes and do not broaden an Admin Console request into native work.
