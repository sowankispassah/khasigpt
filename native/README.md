# KhasiGPT Native

Android-first Expo client for the existing KhasiGPT / ai-chatbot backend.

This folder is a mobile client only. It does not create a new database, schema,
auth system, model system, billing system, or admin system. All protected data
is loaded through the existing Next.js backend and the new `/api/mobile/**`
aggregation endpoints.

## Run Android

1. Start the existing web backend from the repository root:

   ```bash
   pnpm dev
   ```

2. Install the native app dependencies:

   ```bash
   cd native
   npm install
   ```

3. For Android emulator, keep:

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
   ```

   For a physical Android device, set it to your machine LAN URL, for example:

   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:3000
   ```

4. Start Expo:

   ```bash
   npm run start:android
   ```

## Current Mobile Scope

- Auth screens mirror the web structure and use the existing NextAuth account
  behavior.
- Email/password login uses the existing credentials callback.
- Registration uses `/api/mobile/auth/register`, which applies the same
  database queries, rate limits, email verification token creation, and Brevo
  verification email path as the web server action.
- Google login opens the existing backend OAuth flow in the system browser. See
  `docs/smoke-checklist.md` for redirect URI setup before production.
- Chat, translate, jobs, forum, billing, profile, and legal screens are native
  screens backed by existing APIs.
- Admin is intentionally not present in native navigation.

## Native Differences To Resolve Before Store Release

- Google OAuth currently uses the web OAuth path opened through
  `expo-web-browser`. Production apps should register `khasigpt://` deep links
  and add a backend OAuth callback handoff that preserves the existing NextAuth
  callbacks.
- Chat streams are consumed from `/api/chat`; React Native stream parsing may
  need refinement for the exact AI SDK stream protocol used in production.
- Live speech translation is documented as a mobile fallback until native audio
  streaming is wired to backend live translation endpoints.
- Razorpay buttons are wired to the existing backend contract but intentionally
  stop before native SDK checkout until Android merchant settings are confirmed.
