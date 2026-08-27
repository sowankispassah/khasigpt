---
name: khasigpt-provider-opacity
description: Use when creating, changing, debugging, or reviewing KhasiGPT user-facing AI or image-generation UI, errors, retries, status messages, translations, or API responses that could expose provider/model identities or imply that users can select models.
---

# KhasiGPT Provider Opacity

## Product Identity

KhasiGPT is the product identity presented to users. Third-party AI providers,
model names, model IDs, gateways, API endpoints, and credentials are internal
implementation details.

- Never expose a provider or model name in user-facing text, UI labels, errors,
  notifications, chat messages, help text, translations, filenames, or client
  API payloads.
- Refer to the product as `KhasiGPT` and to the capability as image generation,
  chat, translation, or the applicable KhasiGPT feature.
- Provider details may appear only in authenticated admin configuration and
  private server-side diagnostics. Never log or display API keys or secrets.
- Admin-managed character and reference images are also internal. Do not reveal
  that they are used or ask regular users to select, replace, remove, or change
  them.
- Map provider responses to stable KhasiGPT-owned error categories before data
  reaches a client. Preserve the raw provider reason and request ID only in
  private server logs when useful for diagnosis.

## Admin-Controlled Models

- The active model is selected by an administrator. Regular users must not see
  a model picker, model name, provider name, or wording such as `select another
  model` or `try another model`.
- User retries must use the active admin-configured routing. Provider fallback,
  if supported, remains a server/admin concern and must not become a user choice.
- Do not automatically retry a chargeable generation unless the existing
  product flow and billing rules explicitly authorize it.

## User-Facing Failures

Every failed generation must produce a persistent, KhasiGPT-branded assistant
status that survives navigation, refresh, and chat-history restoration. A toast
may provide immediate feedback, but it must not be the only failure record.

Failure copy should:

- say that KhasiGPT could not complete the request;
- give a safe, actionable category such as a safety check, invalid input,
  or temporary service problem;
- suggest editing the prompt or trying again when appropriate;
- never quote provider names, model IDs, raw provider errors, endpoints, or
  request IDs;
- mention that credits were not used only when the application has confirmed
  that no KhasiGPT credit deduction occurred.

Example safety rejection:

> Couldn't complete this image because the request was blocked by a safety
> check. Try changing the prompt and try again.

Use actions such as `Edit prompt` and `Try again`. Do not offer model selection.

## Persistence and Ordering

- Create and persist the user request and generation status before starting the
  external generation call.
- Persist terminal `completed`, `failed`, or `cancelled` status and safe user
  copy for every attempt.
- Keep deterministic turn ordering so each assistant status/result always
  follows the corresponding user request, including when timestamps collide.
- On a failed API response, reconcile the client with the persisted assistant
  failure immediately rather than leaving only optimistic user state.

## Review Checklist

- Search changed user-facing code and translations for provider/model names and
  technical identifiers.
- Confirm regular users have no model-selection control or model-related retry
  wording.
- Confirm admin model controls remain functional and provider diagnostics remain
  private.
- Verify failure status appears immediately and remains correct after navigation
  and a hard refresh.
- Verify user-visible messages are localized through the established translation
  system when new copy is introduced.
