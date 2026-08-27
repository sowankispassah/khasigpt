---
name: push-native-app
description: Push this project's native Android/Expo app from `D:\Coding\ai-chatbot-main\ai-chatbot-main\native` to its separate GitHub repository. Use whenever the user asks to push the native folder, Android app, Expo app, mobile app, or native folder to git. The canonical remote is `https://github.com/sowankispassah/khasigpt-app`.
---

# Push Native App

Use this workflow for `D:\Coding\ai-chatbot-main\ai-chatbot-main` when the user asks to push the native folder/app to git.

## Canonical Paths And Remote

- Root repo: `D:\Coding\ai-chatbot-main\ai-chatbot-main`
- Native app folder: `D:\Coding\ai-chatbot-main\ai-chatbot-main\native`
- Native app Git remote: `https://github.com/sowankispassah/khasigpt-app`
- Default branch: `main`

## Required Behavior

1. Treat `native/` as a separate deployable Android/Expo app, not as part of the root `khasigpt` backend repo.
2. If `native/.git` does not exist, initialize a Git repo inside `native/` and set `origin` to `https://github.com/sowankispassah/khasigpt-app`.
3. If `native/.git` exists, verify `origin` points to `https://github.com/sowankispassah/khasigpt-app`; update it if it points elsewhere.
4. Never commit local secrets, dependencies, generated build output, or temporary files.
5. Commit meaningful native source/config changes and push to `origin main`.
6. Report the commit hash and push result.

## Native Repo Ignore Rules

Ensure `native/.gitignore` exists and includes at least:

```gitignore
node_modules/
.expo/
tmp/
.env
.env*.local
android/.gradle/
android/build/
android/app/build/
android/app/.cxx/
*.keystore
*.jks
*.aab
*.apk
```

Do not remove project files such as `android/`, `src/`, `assets/`, `app.json`, `package.json`, or `package-lock.json`.

## Workflow

Run commands from the root repo unless a command explicitly uses `-C native`.

1. Inspect state:

```powershell
git -C native rev-parse --show-toplevel
git -C native status --short --branch
git -C native remote -v
```

If `git -C native rev-parse --show-toplevel` resolves to the root repo, `native/` is not yet its own Git repo.

2. Initialize or repair the native repo:

```powershell
if (!(Test-Path -LiteralPath 'native/.git')) {
  git -C native init
  git -C native branch -M main
}
git -C native remote remove origin 2>$null
git -C native remote add origin https://github.com/sowankispassah/khasigpt-app
```

3. Ensure ignore rules exist before staging. Use `apply_patch` for manual edits to `native/.gitignore`.

4. Inspect what will be committed:

```powershell
git -C native status --short
```

5. Stage native source/config only:

```powershell
git -C native add .gitignore README.md App.tsx app.json babel.config.js metro.config.js package.json package-lock.json tsconfig.json src assets android
```

6. Confirm no secrets/build artifacts are staged:

```powershell
git -C native diff --cached --name-only
```

If `.env`, `node_modules/`, `.expo/`, `tmp/`, `android/app/build/`, `.aab`, `.apk`, `.jks`, or `.keystore` appears staged, unstage it before committing.

7. Commit and push:

```powershell
git -C native commit -m "Update native app"
git -C native push -u origin main
```

If there is nothing to commit, still run:

```powershell
git -C native push -u origin main
```

## Validation

Before reporting success, run:

```powershell
git -C native status --short --branch
git -C native log -1 --oneline
git -C native remote -v
```

Report whether the working tree is clean or what remains untracked/ignored.
