---
name: git-main-manual-playstore-release
description: Use when completing code, configuration, migration, or engineering-instruction changes in KhasiGPT or its separate native app, and whenever an Android Play Store release is required. Push completed task changes to the correct repository's main branch; prepare signed AAB files locally for the user to upload manually.
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

This Git preference does not request a new AAB for every code edit. Prepare an Android release only when the user requests it or the current task explicitly requires it. Follow the existing authorized web deployment workflow separately.

## Android release: local artifacts only

Use [native-playstore-release-versioning](../native-playstore-release-versioning/SKILL.md) for versioning, release signing, and build verification.

1. Read the current versions in `native/app.json` and `native/android/app/build.gradle`. Choose a new version code greater than the current value and any higher code already known from local artifacts or the user. Never rebuild using the same code. Keep Expo, Gradle, package metadata, and lockfile versions consistent; use `0.1.<versionCode>` unless the user specifies another version name.
2. Run native typechecking and relevant checks, then build the signed release AAB with `gradlew.bat bundleRelease` from `native/android`.
3. Put the final signed bundle in the assigned handoff folder. Unless the user names a different folder, use:
   - `D:\Coding\ai-chatbot-main\ai-chatbot-main\native\builds\khasigpt-<versionName>-v<versionCode>-playstore.aab`
   - Also keep the versioned copy at `native/android/app/build/outputs/bundle/release/khasigpt-<versionName>-v<versionCode>-playstore.aab`.
4. Verify the signature with `jarsigner -verify`, confirm both copies match, and report the version, exact file paths, and passed checks. Describe the artifact as ready for the user's manual upload.
5. Commit and push source/configuration/version changes to the native repository's `main`. Keep AABs and signing credentials out of Git.

**Stop after local artifact preparation and Git delivery. The user handles all Play Console actions manually.**

- Do not upload through a browser, API, EAS Submit, fastlane, or another publishing tool.
- Do not create or edit Play Console releases, add bundles to a track, publish internal/closed/open tests, submit for review, promote releases, or start a production rollout.
- Requests such as "build", "release", "ship", "deploy", or "do both" do not authorize Play Console actions. Only a later explicit user instruction overriding this manual-upload preference can change that boundary.
- If the user reports a version code was already used, prepare a new local bundle with a higher code and hand it back for manual upload; do not attempt the upload yourself.

## Completion

Code changes are complete when the requested result is checked, committed, and pushed to the relevant `main`. An Android release request is complete when its verified signed AAB is in the assigned folder and the matching source changes are on native `main`. Google Play upload or publication is not part of this workflow.
