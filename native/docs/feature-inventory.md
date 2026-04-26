# User-Facing Feature Inventory

Admin screens are excluded from native by design.

## Public Access

- Coming soon: existing `/api/public/site-launch`.
- Maintenance: existing `/api/public/site-launch`.
- Invite-only preview: existing `/api/public/site-launch` and
  `/api/public/invite-access`.
- Offline: native local fallback screen.

## Auth

- Email login: existing NextAuth credentials callback.
- Registration: `/api/mobile/auth/register`, server-side wrapper for existing
  credential user creation, verification token, audit, and email logic.
- Google login: existing NextAuth Google provider through system browser.
- Forgot/reset password: opens existing web flow.
- Complete profile: `/api/mobile/profile` supports profile completion fields.
- Session refresh/sign out: existing `/api/auth/session`, `/api/auth/signout`.
- Guest login: existing `/api/auth/guest` remains web/server-owned and can be
  added to the native button when guest login is enabled for production.

## Main Shell

- Native bottom tabs for Chat, Translate, Jobs, Study, Forum, Billing, Profile,
  and Resources.
- Feature tabs are gated by `/api/mobile/bootstrap` feature access booleans.
- Persistent user menu behavior is represented by the Profile tab and theme /
  sign-out actions.

## Chat

- New chat ID generated client-side, same UUID shape as web.
- History from `/api/history`.
- Messages from `/api/chat/[id]/messages`.
- Streaming send through `/api/chat`.
- Model, visibility, language selectors from `/api/mobile/bootstrap`.
- Suggested prompts and icon prompts from existing admin-configured settings.
- Message copy and vote affordances are present; vote submission should call
  existing `/api/vote` in the next pass.
- Attachments use Expo document picker with image, PDF, and DOCX accepted; upload
  should continue through existing `/api/files/upload`.

## Translate

- Target language list from `/api/mobile/bootstrap`.
- Text translation through `/api/translate`.
- Live speech has an Android fallback note until native audio streaming is
  connected to existing live translation endpoints.

## Jobs

- Jobs list from `/api/jobs/list`.
- Details/source viewer opens existing web routes or source URLs.
- Jobs chat remains backend-side through `/api/chat` jobs mode.

## Study

- Study tab is gated by admin-configured feature access.
- Study chat remains backend-side through `/api/chat` study mode.
- Question paper cards/viewer need a dedicated mobile endpoint if they should be
  browsed outside chat.

## Forum

- Forum overview from `/api/forum/threads`.
- Create-thread UI is present; final submit requires selecting a category from
  the forum overview payload and posts to existing `/api/forum/threads`.
- Thread detail, replies, reactions, subscribe, and views map to existing forum
  endpoints.

## Billing

- Balance and plans from `/api/mobile/billing/plans`.
- Coupon validation maps to existing `/api/billing/coupon/validate`.
- Razorpay order and verification stay on backend:
  `/api/billing/razorpay/order` and `/api/billing/razorpay/verify`.

## Profile

- Profile read/update through `/api/mobile/profile`.
- Avatar read/upload/delete through existing `/api/profile/avatar`.
- Name and date of birth update remain server-authorized.

## Public / Legal

- About, Contact, Privacy, Terms, Calculator open canonical existing web pages.
