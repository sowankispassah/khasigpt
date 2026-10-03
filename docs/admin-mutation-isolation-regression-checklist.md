# Admin Mutation Isolation Regression Checklist

Use this checklist after changing any Admin Console save, update, delete, restore, import, publish, or moderation flow.

## Hard Rules

- Admin writes must not invalidate `/`, `/chat`, root layouts, chat layouts, mobile endpoints, or unrelated user-facing pages.
- Admin writes must route invalidation through `invalidateAdminMutation()` so logs show the mutation source, cache tags, and paths.
- Admin writes must refresh only the affected admin section, affected cache tag, or a narrowly related public page when the public page content itself changed.
- User-facing reads must never repair or write admin configuration as a side effect.
- Failed admin writes must leave user Home, sidebar chat history, normal chat, mobile login, mobile bootstrap, pricing, subscriptions, languages, features, jobs, study, and forum reads available.

## Section Checks

- Models: save/delete/default/baseline invalidates only `model-registry` and optional admin settings refresh.
- Image models: save/delete/activate invalidates only `image-model-registry` and optional admin settings refresh.
- Pricing: create/update/delete/recommendation invalidates only `pricing-plans` and optional admin settings refresh.
- Feature settings: toggles invalidate only the setting tag for the changed feature.
- Languages: language CRUD invalidates only the `languages` tag and Admin Translations when needed.
- Prompts: prompt/icon/free-message saves invalidate only their own app-setting tags.
- Translations: value/default/publish invalidates Admin Translations and translation bundle cache only.
- Coupons: coupon mutations refresh only Admin Coupons.
- Users: user mutations refresh only Admin Users, or Admin RAG when personal knowledge records are involved.
- Chats: admin chat delete/restore refreshes only Admin Chats.
- RAG: RAG mutations refresh only Admin RAG.
- Jobs: job/scrape/source mutations refresh only Admin Jobs and job scrape setting tags where needed.
- Forum: moderation refreshes Admin Forum and only the directly affected forum public page/list.
- Characters: character CRUD refreshes only Admin Characters.
- Static pages: privacy, terms, about, coming soon, and translate settings may refresh only their specific public route.

## Log Verification

For each mutation, confirm server logs contain one `[admin/invalidation]` entry with:

- `source`: the exact mutation name.
- `tags`: only directly affected cache tags.
- `paths`: only the affected admin section or explicitly affected public page.

No mutation log should show `/`, `/chat`, `type: "layout"`, or unrelated public pages.

