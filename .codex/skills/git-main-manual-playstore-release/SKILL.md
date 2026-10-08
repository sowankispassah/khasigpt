---
name: git-main-manual-playstore-release
description: Use when completing code, configuration, migration, or engineering-instruction changes in KhasiGPT or its separate native app, and at the end of every task that changed native app code (an Android release is then required without being asked). Push completed task changes to the correct repository's main branch; prepare signed AAB files in the user's upload folder for manual upload.
---

# Push to Main and Prepare Manual Play Store Releases

This is the user's standing delivery preference for KhasiGPT. Apply it at task completion, not after every keystroke. A later explicit user instruction for a particular task takes precedence.

## Git delivery

| Source | Repository | Delivery branch |
| --- | --- | --- |
| Web/backend at `D:\Coding\ai-chatbot-main\ai-chatbot-main` | `https://github.com/sowankispassah/khasigpt` | `main` |
| Native app at `D:\Coding\ai-chatbot-main\ai-chatbot-main\native` | `https://github.com/sowankispassah/khasigpt-app` | `main` |

1. Inspect the correct repository's status, branch, remote, and `origin/main`. The native folder is a separate repository.
2. Finish the requested changes and run checks appropriate to the affected behavior. Preserve unrelated work and stage explicit task paths only. Exclude secrets, generated bundles, dependencies, and temporary files.
3. Commit the verified task changes and integrate them into current `main`. If the task checkout is on another branch or contains unrelated changes, use an isolated checkout based on `origin/main` and bring across only this task's commits or patch. Preserve newer remote commits; resolve conflicts and check the combined result.
4. Push to `origin main` without force. A task branch or draft PR alone does not finish delivery. When both web/backend and native code changed, deliver each to its own repository's `main`.
5. Verify the delivered commit is on remote `main` and report the commit and push result. If permissions, branch protection, or unresolved checks prevent delivery, report the concrete blocker instead of bypassing protections or claiming success.

Follow the existing authorized web deployment workflow separately.

## When an Android release is required

A native code change only reaches users through a new AAB: the app has no over-the-air updates, so the JavaScript ships inside each bundle. Therefore:

- **Any task that changes shipped native code requires a release.** This covers `native/src/**`, `native/assets/**`, `native/App.tsx`, `native/app.json`, `native/android/**`, and dependency changes in `native/package.json`. Build the release at the end of the task **without waiting for the user to ask**.
- Build once per completed task, after all native changes are verified, not after every edit. If the user asks for a follow-up change later, that is a new task and gets a new release.
- Changes that do not ship in the app (native tests, docs, scripts, or web-only work) do not need a release.
- An explicit user instruction such as "don't build a release yet" overrides this.

## Android release: local artifacts only

Use [native-playstore-release-versioning](../native-playstore-release-versioning/SKILL.md) for versioning, release signing, and build verification.

1. Read the current versions in `native/app.json` and `native/android/app/build.gradle`. Choose a new version code greater than the current value and any higher code already known from local artifacts or the user. Never rebuild using the same code. Keep Expo, Gradle, package metadata, and lockfile versions consistent; use `0.1.<versionCode>` unless the user specifies another version name.
2. Run native typechecking and relevant checks, then build the signed release AAB with `gradlew.bat bundleRelease` from `native/android`.
3. Put the final signed bundle in **both** folders under the versioned name `khasigpt-<versionName>-v<versionCode>-playstore.aab`, unless the user names a different folder:
   - **Upload folder (the user uploads from here):** `D:\Coding\ai-chatbot-main\ai-chatbot-main\native\android\app\build\outputs\bundle\release\khasigpt-<versionName>-v<versionCode>-playstore.aab`
   - **Archive copy:** `D:\Coding\ai-chatbot-main\ai-chatbot-main\native\builds\khasigpt-<versionName>-v<versionCode>-playstore.aab`
   Gradle only writes `app-release.aab`; the versioned copy in the upload folder must be made explicitly every time. Missing it leaves an older versioned file as the newest one there, and the user uploads the wrong build.
4. Verify the signature with `jarsigner -verify`, compare the SHA-256 of both copies (and `app-release.aab`) to confirm they are identical, and confirm the version in the bundle manifest.
5. Commit and push source/configuration/version changes to the native repository's `main`. Keep AABs and signing credentials out of Git.
6. Report the version, the **upload-folder path first**, the archive path, and the checks that passed. Describe the artifact as ready for the user's manual upload. If an earlier build from the same session was superseded, say which file to upload and which to skip.

**Stop after local artifact preparation and Git delivery. The user handles all Play Console actions manually.**

- Do not upload through a browser, API, EAS Submit, fastlane, or another publishing tool.
- Do not create or edit Play Console releases, add bundles to a track, publish internal/closed/open tests, submit for review, promote releases, or start a production rollout.
- Requests such as "build", "release", "ship", "deploy", or "do both" do not authorize Play Console actions. Only a later explicit user instruction overriding this manual-upload preference can change that boundary.
- If the user reports a version code was already used, prepare a new local bundle with a higher code and hand it back for manual upload; do not attempt the upload yourself.

## Completion

Code changes are complete when the requested result is checked, committed, and pushed to the relevant `main`. A task that changed shipped native code is complete only when its verified signed AAB is in the upload folder (and the archive copy in `native/builds/`) and the matching source and version changes are on native `main`. Google Play upload or publication is not part of this workflow.
