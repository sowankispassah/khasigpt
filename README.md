<a href="https://chat.vercel.ai/">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="app/(chat)/opengraph-image.png">
  <h1 align="center">Chat SDK</h1>
</a>

<p align="center">
    Chat SDK is a free, open-source template built with Next.js and the AI SDK that helps you quickly build powerful chatbot applications.
</p>

<p align="center">
  <a href="https://chat-sdk.dev"><strong>Read Docs</strong></a> A?
  <a href="#features"><strong>Features</strong></a> A?
  <a href="#model-providers"><strong>Model Providers</strong></a> A?
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> A?
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports OpenAI (default), Fireworks, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - [Neon Serverless Postgres](https://vercel.com/marketplace/neon) for saving chat history and user data
  - [Vercel Blob](https://vercel.com/storage/blob) for efficient file storage
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication

## Model Providers

Models are now configured at runtime from the admin console (`/admin/settings`). Admins can add OpenAI, Anthropic, or Google Gemini models (including custom prompts, sample code, and provider-specific options) without redeploying the app. The chatbot falls back to a seeded OpenAI GPT-4o mini configuration if the catalog is empty.

- Provide the appropriate API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) in `.env.local`.
- Use the Settings tab in the admin console to enable/disable models or mark the default model that new conversations should use.
- Reasoning output can be toggled per model by supplying the reasoning tag emitted by the provider (e.g., `<think>`).

## Deploy Your Own

You can deploy your own version of the Next.js AI Chatbot to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/templates/next.js/nextjs-ai-chatbot)

## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. It's recommended you use [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) for this, but a `.env` file is all that is necessary.

> Note: You should not commit your `.env` file or it will expose secrets that will allow others to control access to your various AI and authentication provider accounts.

1. Install Vercel CLI: `npm i -g vercel`
2. Link local instance with Vercel and GitHub accounts (creates `.vercel` directory): `vercel link`
3. Download your environment variables: `vercel env pull`

```bash
pnpm install
pnpm dev
```

Visit `http://localhost:3000/register` the first time you run the app to create your own account; unauthenticated sessions no longer fall back to a guest user.

Your app template should now be running on [localhost:3000](http://localhost:3000).

### Email verification

New accounts must confirm their email address before signing in. The same mailer also powers password reset links. Configure the following environment variables (see [`.env.example`](.env.example)):

- `APP_BASE_URL` (or provide `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`) so verification links point to the correct domain.
- `BREVO_API_KEY` and `BREVO_SENDER_EMAIL` for transactional emails sent via Brevo (Sendinblue).
- Optional overrides: `BREVO_SENDER_NAME`, `BREVO_PARTNER_KEY`.

Users who attempt to register with an existing, verified email will see an error. Re-registering with an unverified email resends the verification link.

### Google sign-in

Optional Google OAuth support is built in. Provide the credentials from Google Cloud Console (OAuth client type “Web application”):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

If these are absent, the Google button is hidden and only email/password and verification are used.


## Credits & Billing

- Admins manage credit plans from `/admin/settings`, including pricing, token allowance, and billing cycle.
- Users can recharge at `/recharge`; plans convert tokens into display credits (1 credit = 100 tokens).
- The `/subscriptions` dashboard summarises total consumption, daily trends, per-session usage, and plan validity.

