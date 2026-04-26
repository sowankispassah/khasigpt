# Route And API Mapping

| Web route/component | Current data source | Native screen | New endpoint |
| --- | --- | --- | --- |
| `app/(public)/coming-soon` | launch settings | `LaunchGateScreen` | none |
| `app/(public)/maintenance` | launch settings | `LaunchGateScreen` | none |
| `app/(auth)/login` | NextAuth credentials/Google | `LoginScreen` | none |
| `app/(auth)/register` | server action | `RegisterScreen` | `/api/mobile/auth/register` |
| `app/(auth)/forgot-password` | web reset flow | `ForgotPasswordScreen` | none |
| `app/(auth)/complete-profile` | server action | `ProfileScreen` | `/api/mobile/profile` |
| `components/site-shell*` | session/language/features | native tabs/profile | `/api/mobile/bootstrap` |
| `components/page-user-menu` | session/billing/language | `ProfileScreen` + tabs | `/api/mobile/bootstrap` |
| `app/(chat)/chat` | server component payload | `ChatScreen` | `/api/mobile/bootstrap` |
| `app/(chat)/chat/[id]` | messages/history APIs | `ChatScreen` | none |
| `components/chat.tsx` | `/api/chat` stream | `ChatScreen` | none |
| `components/model-selector*` | model registry | `ChatScreen` | `/api/mobile/bootstrap` |
| `components/visibility-selector` | chat visibility | `ChatScreen` | none |
| `components/suggested-actions` | suggested prompt settings | `ChatScreen` | `/api/mobile/bootstrap` |
| `components/icon-prompt-actions` | icon prompt settings | `ChatScreen` | `/api/mobile/bootstrap` |
| `components/multimodal-input` | upload/chat APIs | `ChatScreen` | none |
| `app/(chat)/translate` | server component payload | `TranslateScreen` | `/api/mobile/bootstrap` |
| `components/translate-page-client` | `/api/translate` | `TranslateScreen` | none |
| `app/(chat)/jobs/[id]` | jobs service/API | `JobsScreen` | none |
| `app/forum/**` | forum service/API | `ForumScreen` | none |
| `app/(chat)/recharge` | server component payload | `BillingScreen` | `/api/mobile/billing/plans` |
| `app/(chat)/subscriptions` | balance/usage queries | `BillingScreen` | `/api/mobile/billing/plans` for first pass |
| `app/(chat)/profile` | server action/page payload | `ProfileScreen` | `/api/mobile/profile` |
| `app/about`, legal pages | static/server pages | `LegalScreen` | none |
| `app/(calculator)/calculator` | calculator route | `LegalScreen` link | none |

## No Native Admin Screens

Admin routes under `app/(admin)` and `/admin` are intentionally not mapped into
native navigation. Admin configuration remains web-only and the native app only
consumes the resulting user-facing settings.
