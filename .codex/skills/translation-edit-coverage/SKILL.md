---
name: translation-edit-coverage
description: Use when adding or modifying user-facing UI text, native or web modals, dialogs, buttons, toasts, loading states, errors, placeholders, menus, admin inline translation edit mode, localization keys, or translation fallback behavior in this KhasiGPT repository. Ensures all visible static copy is translated and editable for admins where appropriate.
---

# Translation Edit Coverage

## Core Rule

Every visible static UI string must go through the app translation system. If admin Translation Edit Mode is available on that surface, the text must also use the inline editable translation wrapper, not only a plain translation lookup.

Do not add hardcoded user-facing strings to web or native UI unless the content is dynamic user data or intentionally not translatable.

## What Must Be Translatable

Wrap these by default:

- Page titles, section headings, subtitles, descriptions, empty states, and helper text.
- Buttons, links, tabs, menu items, dropdown labels, and action chips.
- Modals, dialogs, alerts, confirmation sheets, and bottom sheets.
- Toasts, local errors, validation messages, retry messages, and loading text.
- Form labels and placeholders. For placeholders that cannot be directly wrapped, add an adjacent edit affordance when edit mode is active or use the project helper for editable placeholders.
- Pricing, upgrade, credits, feature-gating, auth, billing, forum, chat, profile, language, and settings copy.

Do not wrap by default:

- Usernames, emails, chat messages, AI responses, forum posts, job titles, uploaded filenames, and other user-generated or dynamic records.
- Admin-defined prompt/icon labels that already come from their own per-language admin settings model. Route inline edits for those through that model, not `translation_value`.

## Stable Key Rules

- Use stable semantic keys, never raw English copy as the key.
- Prefer namespaced keys such as `chat.input.placeholder`, `image.upgrade_prompt.title`, `billing.overview.current_plan`.
- Keep English source copy in the `defaultText` argument and in `lib/i18n/static-definitions.ts` when adding a new static key.
- Use interpolation for dynamic values: `Page {page} of {total}`, not concatenated translated fragments.
- Inline edits save only the selected language value. Do not overwrite English source text from inline edit mode.

## Web Pattern

Use `EditableTranslation` for visible text when edit mode should be available:

```tsx
<EditableTranslation
  translationKey="image.upgrade_prompt.title"
  defaultText="Upgrade required"
  description="Title shown in the image generation upgrade-required modal."
/>
```

Use `useEditableTranslation` for non-text props or when the edit affordance must sit beside an input, placeholder, icon button, or custom control.

Plain `translate(key, defaultText)` is acceptable only when the text cannot be inline edited from that location and there is a deliberate adjacent edit affordance.

## Native Pattern

Use `EditableTranslationText` for visible `Text` content:

```tsx
<EditableTranslationText
  translationKey="image.upgrade_prompt.cta"
  defaultText="Upgrade Plan"
  description="Button label that opens the recharge or upgrade plan screen."
  style={styles.buttonText}
/>
```

For native placeholders, button props, toasts, and alerts that cannot wrap text directly, use translated values for display and provide an edit-mode affordance nearby if the text is visible and admin-editable.

Modal content must use editable components for title, body, and action labels.

## Fallback And Hydration Safety

- A missing translation may render English fallback, but it must still be editable in admin Translation Edit Mode.
- Do not reset the selected language or dictionary because a page-specific request fails.
- Do not clear cached dictionaries while a refresh is pending.
- New translation keys must not block login, bootstrap, sidebar, chat history, billing, or forum loading.

## Checklist Before Shipping UI Text

- Search edited files for raw strings in `Text`, JSX text nodes, button labels, placeholder props, toast/error calls, and modal content.
- Confirm every static visible string has a stable key and default text.
- Confirm admin edit mode shows an editable highlight for the new text on native and web where supported.
- Confirm non-admin users see normal text with no edit affordance.
- Confirm English and Khasi both render without flicker or falling back due to a failed optional request.
- Run typecheck and targeted lint/format checks for changed files.
