# KhasiGPT

KhasiGPT is an AI assistant tailored for Khasi speakers. It blends localised language understanding with a polished web experience, giving communities in Northeast India a modern tool for translation, writing, and research in their own language. The project ships with a production-ready Next.js stack, an admin console for managing models and billing, and a responsive UI designed for both desktop and mobile.


## Why KhasiGPT?

- **Culturally aware AI** – prompts, tone, and default copy are written with Khasi speakers in mind so conversations feel natural.
- **Runtime model catalog** – add OpenAI, Anthropic, Google Gemini, or other AI SDK models from the admin panel without redeploying.
- **Flexible monetisation** – prepaid credits, recurring plans, and usage dashboards help sustain the service.
- **Responsive UX** – persistent user menu, mobile-friendly drawers, and accessibility-first components from shadcn/ui.
- **Secure accounts** – email verification, optional Google OAuth, and password resets via Brevo transactional emails.


## Tech Stack

- **Framework:** Next.js 14 (App Router, Server Actions, React Server Components)
- **UI:** Tailwind CSS, shadcn/ui, Radix primitives
- **AI SDK:** Vercel AI SDK with streaming, tool calls, and structured outputs
- **Auth:** Auth.js (NextAuth) with Email + OAuth providers
- **Database:** Neon/PostgreSQL via Drizzle ORM
- **Storage:** Vercel Blob for uploads
- **Tooling:** TypeScript, pnpm, Biome, Playwright, Vitest


## Getting Started

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Generate a `.env.local`**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the required secrets (see the table below).
3. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```
4. **Start the app**
   ```bash
   pnpm dev
   ```
   Open http://localhost:3000/register to create the first admin user.


## Environment Variables

All keys are documented in `.env.example`. Common values include:

| Variable | Purpose |
| --- | --- |
| `NEXTAUTH_SECRET` | Session encryption for Auth.js |
| `NEXT_PUBLIC_APP_URL` | Public base URL, used for share links and emails |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` | Provider credentials for chat models |
| `DATABASE_URL` | Neon or PostgreSQL connection string |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` | Transactional email for verification and reset flows |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage access |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Credentials for the Supabase vector store backing RAG |
| `RAG_SUPABASE_TABLE` | Supabase table that stores embeddings (`rag_embeddings` by default) |
| `RAG_SUPABASE_MATCH_FUNCTION` | RPC name used for similarity search (`match_rag_embeddings`) |
| `RAG_MATCH_LIMIT` / `RAG_MATCH_THRESHOLD` | Tune how many snippets and what cosine cutoff are applied |
| `RAG_EMBEDDING_MODEL` | Embedding model ID (defaults to `text-embedding-3-large`) |

Run `pnpm lint` or `pnpm test` to check for missing configuration before deployment.


## Key Features

- **Chat workspace** – rich text composer with file uploads, model switching, and streaming responses.
- **Model selector** – admins seed model configs; users switch between available models directly in the chat input.
- **Admin console** – manage users, content pages (About, Terms, Privacy), pricing plans, and contact submissions.
- **Billing + usage** – prepaid recharge, plan upgrades, and detailed usage analytics for every account.
- **Content management** – About page, resources, and support forms managed from the same dashboard.
- **Internationalisation ready** – language-specific copy lives in database entries so translators can localise without code changes.


## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` | Create an optimised production build |
| `pnpm start` | Run the production server |
| `pnpm lint` | Run Biome linting and formatting checks |
| `pnpm test` | Execute automated tests (Vitest / Playwright) |
| `pnpm db:migrate` | Apply Drizzle migrations to the configured database |


## Deployment

- Deploy directly to Vercel (recommended). Configure environment variables in the Vercel dashboard.
- For custom hosts, create a `.vercel` directory with `vercel link` or replicate the environment variables manually.
- Remember to set `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, and mailer credentials in production.


## Project Structure

- `app/` – App Router routes with nested layouts for chat, auth, and admin sections.
- `components/` – Reusable UI, including the chat composer, dropdown menus, and analytics widgets.
- `lib/` – Utility functions, Drizzle schema, AI prompts, and helper hooks.
- `hooks/` – Client-side hooks for theme, keyboard shortcuts, and data fetching.
- `types/` – Shared TypeScript definitions for chats, billing, and model metadata.
- `public/` – Static assets (logo, OG images, favicons).


## Contributing

1. Fork the repository and create a feature branch.
2. Run `pnpm lint` and `pnpm test` before opening a pull request.
3. Describe the change, include screenshots for UI updates, and tag maintainers for review.

Bug reports and feature requests are welcome via GitHub Issues.


## License

MIT © 2024 Khasi Digital Collective. See `LICENSE` for details.

