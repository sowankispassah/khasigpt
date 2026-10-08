---
name: native-playstore-release-versioning
description: Always use when building, rebuilding, creating, or preparing a native Android Play Store release AAB from the `native` folder, including the automatic release at the end of any task that changed shipped native code. Ensures every Play Store artifact uses a new versionCode/versionName and lands in the user's upload folder under its versioned name.
---

# Native Play Store Release Versioning

Use this skill for every request to build, rebuild, create, prepare, or copy a Play Store release for the native Android app, and at the end of every task that changed shipped native code (the release is then required without the user asking; see [git-main-manual-playstore-release](../git-main-manual-playstore-release/SKILL.md#when-an-android-release-is-required)).

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
3. Edit every file that carries the version before building:
   - `native/app.json` (`version` and `android.versionCode`)
   - `native/android/app/build.gradle` (`versionCode` and `versionName`)
   - `native/package.json` (`version`)
   - `native/package-lock.json` (the root `version` and `packages[""].version`)
4. Run native checks before the release build:
   - `npx.cmd tsc --noEmit` from `native`
   - Relevant targeted lint/checks for edited files when available
5. Build from `native/android` (takes about 5 to 12 minutes; run it in the background):
   - `.\gradlew.bat bundleRelease`
6. Copy the generated `app-release.aab` to **both** versioned paths. Gradle never writes the versioned name itself, so this step is mandatory every time:
   - **Upload folder (the user uploads from here):** `native/android/app/build/outputs/bundle/release/khasigpt-<versionName>-v<versionCode>-playstore.aab`
   - **Archive copy:** `native/builds/khasigpt-<versionName>-v<versionCode>-playstore.aab`
7. Verify the artifacts:
   - `jarsigner -verify` on the upload-folder copy
   - The SHA-256 of the upload-folder copy, the archive copy and `app-release.aab` must be identical
   - The new `versionName` appears in `base/manifest/AndroidManifest.xml` inside the bundle
8. In the final response, clearly state:
   - The new `versionCode` and `versionName`
   - The upload-folder path first, then the archive path
   - The checks that passed
   - If an earlier build from the same session was superseded, which file to upload and which to skip

## Important Notes

- If the user asks to rebuild an existing uploaded version, do not reuse it. Bump to the next version automatically.
- If the user says a version was already uploaded, immediately bump to the next version before building again.
- Do not ask the user whether to bump for Play Store builds. Bumping is mandatory.
- Do not expose keystore details, signing passwords, or secrets.
- Keep package and lockfile versions consistent with Expo and Gradle when they carry the release version.
- Commit and push the source/version changes to native `main`; keep generated bundles out of Git.
- Finish with the verified AAB in the upload folder `native/android/app/build/outputs/bundle/release/` (plus the archive copy in `native/builds/`), or in the folder the user assigns. The user handles all Play Console actions manually, including internal testing uploads.
- The app has no over-the-air updates: a phone only gets a native change after installing a newer AAB. If the user reports a fix "not working" on the phone, first check which version they installed and whether the newest versioned file is in the upload folder.
