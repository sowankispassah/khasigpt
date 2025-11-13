# KhasiGPT

KhasiGPT is an AI assistant tailored for Khasi speakers. It blends localised language understanding with a polished web experience, giving communities in Northeast India a modern tool for translation, writing, and research in their own language. The project ships with a production-ready Next.js stack, an admin console for managing models and billing, and a responsive UI designed for both desktop and mobile.

## Native apps (Expo)

The `native/` directory hosts a React Native + Expo client that mirrors the KhasiGPT experience on Android and iOS while reusing the same backend and authentication stack.

1. Copy `native/.env.example` to `native/.env` and set the `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_WEB_BASE_URL` values to the URL of your running Next.js instance (for local development use `http://localhost:3000`).
2. If you plan to run Expo on a different origin (e.g. `http://localhost:8081` or a phone on your LAN), add those origins to the root `.env` via `CORS_ALLOWED_ORIGINS="http://localhost:8081,http://192.168.1.25:8081"` so the Next.js APIs send the right CORS headers for cookie-based auth.
3. Install dependencies and start Expo:

   ```bash
   cd native
   npm install
   npm run ios # or npm run android / npm run web
   ```

The mobile shell ships with native navigation, persistent user menu + progress indicator (matching the web interaction standards), and placeholder chat/history/usage/profile screens ready to be wired to the live APIs.

## Why KhasiGPT?

- **Culturally aware AI** – prompts, tone, and default copy are written with Khasi speakers in mind so conversations feel natural.
- **Runtime model catalog** – add OpenAI, Anthropic, Google Gemini, or other AI SDK models from the admin panel without redeploying.
- **Flexible monetisation** – prepaid credits, recurring plans, and usage dashboards help sustain the service.
- **Responsive UX** – persistent user menu, mobile-friendly drawers, and accessibility-first components from shadcn/ui.
- **Secure accounts** – email verification, optional Google OAuth, and password resets via Brevo transactional emails.
