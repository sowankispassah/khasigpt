import { createHash } from "node:crypto";
import path from "node:path";
import type { NextConfig } from "next";
import { PRELOAD_PROGRESS_SCRIPT, THEME_COLOR_SCRIPT } from "./lib/security/inline-scripts";
import { buildStructuredData, getSiteUrl } from "./lib/seo/site";

const isDevelopment = process.env.NODE_ENV !== "production";
const distDir = process.env.NEXT_DIST_DIR?.trim();

const inlineScriptHashes = [
  PRELOAD_PROGRESS_SCRIPT,
  THEME_COLOR_SCRIPT,
  JSON.stringify(buildStructuredData(getSiteUrl())),
].map(
  (content) =>
    `'sha256-${createHash("sha256").update(content).digest("base64")}'`
);

const scriptSrc = isDevelopment
  ? [
      "script-src",
      "'self'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      "blob:",
      "data:",
      "https://cdn.jsdelivr.net",
      "https://checkout.razorpay.com",
    ].join(" ")
  : [
      "script-src",
      "'self'",
      "'strict-dynamic'",
      "'nonce-__NEXT_SCRIPT_NONCE__'",
      ...inlineScriptHashes,
      "https://cdn.jsdelivr.net",
      "https://checkout.razorpay.com",
    ].join(" ");

const connectSrc = [
  "connect-src",
  "'self'",
  "https://*.supabase.co",
  "https://*.supabase.net",
  "https://*.vercel.com",
  "https://*.vercel.app",
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://generativelanguage.googleapis.com",
  "https://cdn.jsdelivr.net",
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  ...(isDevelopment
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
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.vercel-storage.com https://avatar.vercel.sh",
      "font-src 'self'",
      "worker-src 'self' blob:",
      connectSrc,
      frameSrc,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), autoplay=(self)",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
