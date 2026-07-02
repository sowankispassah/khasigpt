# Pre-Launch Checklist

This project is not ready for a public launch until the items below are complete.

## Blockers

1. Rotate all secrets currently present in local `.env`.
2. Move runtime secrets into deployment-managed environment variables.
3. Explicitly verify site-access settings in the admin console before exposing production traffic.
4. Run production-like smoke tests for auth, billing, uploads, chat, and admin access before opening traffic.
5. Verify external dependencies with production credentials: Brevo, Razorpay, Supabase, Blob, Redis, and model providers.

## Secrets

- Rotate OpenAI, Anthropic, Google, Brevo, Supabase, Postgres, Vercel Blob, Redis, and Razorpay credentials if they were ever shared outside a trusted local machine.
- Do not reuse existing live keys for production after rotation.
- Keep `.env` local-only and configure production secrets in the hosting platform.

## Release Verification

- `pnpm.cmd typecheck`
- `pnpm.cmd lint`
- `pnpm.cmd build`
- Focused route smoke checks:
  - `pnpm.cmd exec playwright test --project=routes --workers=1 --reporter=line --grep billing`
  - `pnpm.cmd exec playwright test --project=routes --workers=1 --reporter=line --grep avatar`
- Full `pnpm.cmd test` after confirming the environment is configured for the broader Playwright suite.

## Manual Smoke Checklist

- Anonymous visitor:
  - Visit `/login`, `/register`, `/about`, `/privacy-policy`, `/terms-of-service`.
  - Confirm site-access gating behaves correctly for public, invite-only, and maintenance modes.
- Authenticated user:
  - Sign in and confirm `/chat`, `/profile`, `/recharge`, `/subscriptions`, and `/forum` load.
  - Create a chat, refresh, reopen it from history, and verify messages persist.
  - Upload an avatar and confirm invalid files are rejected.
  - Open the user menu, change language/theme, and confirm navigation feedback appears immediately.
- Billing:
  - Validate coupon lookup, order creation, payment verification, and balance refresh.
  - Confirm recharge history and remaining credits/tokens update after payment.
- Admin:
  - Verify `/admin` loads only for admins.
  - Toggle site-access settings and confirm public gating changes take effect.
  - Check jobs, RAG, translations, and live-users pages for basic load success.

## Operational Checks

- Set `site.publicLaunched`, `site.underMaintenance`, `site.prelaunchInviteOnly`, and admin-entry settings deliberately before go-live.
- Verify payment creation and payment verification flows with non-production credentials first.
- Confirm email delivery, password reset, and verification links use the production base URL.
- Confirm Supabase storage, RAG sync, jobs scraping, and rate limiting behave correctly with production env vars.
- Review CSP, canonical host, and CORS settings for the real production domain.

## Rollout Recommendation

- Launch behind invite-only or maintenance controls first.
- Run a private smoke test with admin and non-admin accounts.
- Open public access only after tests pass and launch settings are explicitly enabled.
