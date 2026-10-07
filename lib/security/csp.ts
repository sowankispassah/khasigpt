import { createHash } from "node:crypto";
import { buildStructuredData, getSiteUrl } from "../seo/site";
import { contactImageOrigin } from "./contact-image-origin";
import { PRELOAD_PROGRESS_SCRIPT, THEME_COLOR_SCRIPT } from "./inline-scripts";

// Imported by next.config.ts as well as proxy.ts, so keep imports relative.
const isDevelopment = () => process.env.NODE_ENV !== "production";

const inlineScriptHashes = [
  PRELOAD_PROGRESS_SCRIPT,
  THEME_COLOR_SCRIPT,
  JSON.stringify(buildStructuredData(getSiteUrl())),
].map(
  (content) =>
    `'sha256-${createHash("sha256").update(content).digest("base64")}'`,
);

const scriptHosts = [
  "https://cdn.jsdelivr.net",
  "https://checkout.razorpay.com",
  "https://va.vercel-scripts.com",
];

const buildConnectSrc = () =>
  [
    "connect-src",
    "'self'",
    "https://*.supabase.co",
    "https://*.supabase.net",
    "https://*.vercel.com",
    "https://*.vercel.app",
    "https://api.openai.com",
    "https://api.anthropic.com",
    "https://generativelanguage.googleapis.com",
    "wss://generativelanguage.googleapis.com",
    "https://cdn.jsdelivr.net",
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
    "https://vitals.vercel-insights.com",
    "https://va.vercel-scripts.com",
    ...(isDevelopment()
      ? [
          "ws://localhost:*",
          "ws://127.0.0.1:*",
          "http://localhost:*",
          "http://127.0.0.1:*",
        ]
      : []),
  ].join(" ");

const frameSrc = [
  "frame-src",
  "'self'",
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://www.youtube-nocookie.com",
].join(" ");

const buildFrameAncestors = () =>
  isDevelopment()
    ? "frame-ancestors 'self' http://localhost:8081 http://127.0.0.1:8081"
    : "frame-ancestors 'none'";

function buildScriptSrc(nonce: string | undefined) {
  if (isDevelopment()) {
    // A nonce would make browsers ignore 'unsafe-inline', which dev tooling needs.
    return [
      "script-src",
      "'self'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      "blob:",
      "data:",
      ...scriptHosts,
    ].join(" ");
  }

  return [
    "script-src",
    "'self'",
    ...(nonce ? ["'strict-dynamic'", `'nonce-${nonce}'`] : []),
    ...inlineScriptHashes,
    ...scriptHosts,
  ].join(" ");
}

/**
 * Pages get a per-request nonce from proxy.ts; Next.js reads it from the
 * request's CSP header and stamps it on the scripts it renders. Responses that
 * never render pages (API routes) use the nonce-free policy.
 */
export function buildContentSecurityPolicy(nonce?: string) {
  return [
    "default-src 'self'",
    buildScriptSrc(nonce),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.vercel-storage.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://avatar.vercel.sh https://i.ytimg.com https://*.googleusercontent.com https://*.gstatic.com https://*.bing.net https://commons.wikimedia.org https://upload.wikimedia.org ${contactImageOrigin(process.env.SUPABASE_URL)}`.trim(),
    "font-src 'self'",
    "worker-src 'self' blob:",
    buildConnectSrc(),
    frameSrc,
    buildFrameAncestors(),
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function createCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}
