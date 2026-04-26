# Design Inventory

## Source Files Inspected

- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/(chat)/chat/page.tsx`
- `app/(chat)/chat/[id]/page.tsx`
- `app/(chat)/translate/page.tsx`
- `app/(chat)/jobs/[id]/page.tsx`
- `app/forum/**`
- `app/(public)/**`
- `app/(calculator)/**`
- `components/site-shell.tsx`
- `components/site-shell-extras.tsx`
- `components/page-user-menu.tsx`
- `components/user-dropdown-menu.tsx`
- `components/chat.tsx`
- `components/chat-header.tsx`
- `components/messages.tsx`
- `components/message.tsx`
- `components/message-actions.tsx`
- `components/multimodal-input.tsx`
- `components/suggested-actions.tsx`
- `components/icon-prompt-actions.tsx`
- `components/model-selector*.tsx`
- `components/visibility-selector.tsx`
- `components/ui/**`
- `public/images/**`

## Tokens

- Light background: `#ffffff`
- Light foreground: `#09090b`
- Muted surface: `#f4f4f5`
- Muted foreground: `#71717a`
- Border/input: `#e4e4e7`
- Dark background: `#09090b`
- Dark foreground: `#fafafa`
- Dark muted surface: `#27272a`
- Radius: web `--radius` is `0.5rem`; native uses 4, 6, 8, and 16 only where
  the web already uses larger shells.

## Auth Layout

Native mirrors:

- Centered narrow column.
- KhasiGPT subtitle.
- Existing `khasigptlogo.png`.
- Page title.
- Continue with Google.
- Continue/sign up with Email toggle.
- Email/password form.
- Error/status messages.
- Sign-in/sign-up links.

## Chat Layout

Native mirrors:

- Sticky header equivalent with New Chat, model selector, visibility selector.
- Chat language chips.
- Greeting and suggested prompts.
- Icon prompt buttons.
- User messages aligned right with primary foreground.
- Assistant messages aligned left on card/background surface.
- Message actions row.
- Bottom composer with paperclip, multiline input, send/stop button.
- Disclaimer text.

## Shell

Web uses a fixed top-right user menu; mobile uses bottom tabs plus Profile for
the persistent account actions because this is the native equivalent of always
available account navigation.

## Assets

- `native/assets/khasigptlogo.png` is copied from `public/images/khasigptlogo.png`.

## Native Differences

- Radix dropdowns/sheets become native tabs, chips, cards, and pressables.
- Web iframes for documents are opened in a system browser until native PDF/DOCX
  rendering is selected.
- Browser live speech APIs are not available in React Native; Android fallback
  is text translation until native audio streaming is added.
