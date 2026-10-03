---
name: native-playstore-release-versioning
description: Always use when building, rebuilding, creating, or preparing a native Android Play Store release AAB from the `native` folder. Ensures every Play Store artifact uses a new versionCode/versionName before building so an already-uploaded release is never overwritten or reused.
---

# Native Play Store Release Versioning

Use this skill for every request to build, rebuild, create, prepare, or copy a Play Store release for the native Android app.

Follow [git-main-manual-playstore-release](../git-main-manual-playstore-release/SKILL.md): this workflow produces local artifacts for the user's manual upload. Do not upload, create or edit Play Console releases, publish testing tracks, submit for review, or start production rollouts.

## Hard Rule

Never rebuild a Play Store AAB using the same `versionCode` as the current project state or a previously created artifact in this conversation. Before running `gradlew bundleRelease`, always bump to the next version.

## Required Workflow

1. Read the current native version from:
   - `native/app.json`
   - `native/android/app/build.gradle`
2. Determine the next release version:
   - Increment `versionCode` by `1`.
   - Set `versionName` and Expo `version` to `0.1.<versionCode>` unless the user explicitly gives a different semantic version.
3. Edit both files before building:
   - `native/app.json`
   - `native/android/app/build.gradle`
4. Run native checks before the release build:
   - `npx.cmd tsc --noEmit` from `native`
   - Relevant targeted lint/checks for edited files when available
5. Build from `native/android`:
   - `.\gradlew.bat bundleRelease`
6. Copy the generated bundle to versioned artifact names:
   - `native/android/app/build/outputs/bundle/release/khasigpt-<versionName>-v<versionCode>-playstore.aab`
   - `native/builds/khasigpt-<versionName>-v<versionCode>-playstore.aab`
7. Verify the copied artifact:
   - `jarsigner -verify <versioned-aab-path>`
8. In the final response, clearly state:
   - The new `versionCode`
   - The new `versionName`
   - The exact AAB paths
   - The checks that passed

## Important Notes

- If the user asks to rebuild an existing uploaded version, do not reuse it. Bump to the next version automatically.
- If the user says a version was already uploaded, immediately bump to the next version before building again.
- Do not ask the user whether to bump for Play Store builds. Bumping is mandatory.
- Do not expose keystore details, signing passwords, or secrets.
- Keep package and lockfile versions consistent with Expo and Gradle when they carry the release version.
- Commit and push the source/version changes to native `main`; keep generated bundles out of Git.
- Finish with the verified AAB in `native/builds/` or the user-assigned folder. The user handles all Play Console actions manually, including internal testing uploads.
