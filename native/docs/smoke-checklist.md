# Android And iOS Smoke Checklist

## Backend

- Run `pnpm dev` from the repository root.
- Confirm `GET /api/mobile/bootstrap` returns public bootstrap data when signed
  out.
- Confirm `GET /api/mobile/bootstrap` returns feature access, model config,
  prompts, billing, and session data when signed in.
- Confirm no secrets appear in any mobile response.

## Android Emulator

- Set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`.
- Run `npm run start:android`.
- Verify launch gate:
  - normal public launch
  - maintenance
  - coming soon
  - invite-only
- Verify auth:
  - email login
  - invalid credentials error
  - register sends verification email
  - forgot password opens existing web reset flow
  - sign out clears session cookies
- Verify shell:
  - tabs match enabled feature flags
  - Profile toggles dark/light mode
- Verify chat:
  - new chat opens
  - model selector cycles backend models
  - visibility toggles private/public
  - language chips come from backend
  - suggested/icon prompts fill composer
  - send starts `/api/chat`
  - stop aborts the request
  - history opens existing chats
- Verify translate:
  - target languages come from backend
  - text translation succeeds
- Verify jobs/forum/billing/profile/legal:
  - lists load from backend
  - no admin screens are reachable
  - Razorpay buttons do not expose secrets

## Google Redirect Setup

For production Android and iOS, configure a deep link callback such as:

- Android/iOS scheme: `khasigpt://auth/callback`
- Backend handoff endpoint: use existing NextAuth Google callbacks and redirect
  back to the deep link after the server session cookie is established.
- Google OAuth authorized redirects must remain backend URLs. Do not put the
  Google client secret in the native app.

## iOS Later

- Set `ios.bundleIdentifier` in `app.json`.
- Add associated domains/deep link settings for the chosen callback.
- Re-run the same checklist with `npm run ios`.
