import { createHash } from "node:crypto";
import path from "node:path";
import type { NextConfig } from "next";
import { contactImageOrigin } from "./lib/security/contact-image-origin";
import {
  PRELOAD_PROGRESS_SCRIPT,
  THEME_COLOR_SCRIPT,
} from "./lib/security/inline-scripts";
import { buildStructuredData, getSiteUrl } from "./lib/seo/site";

const isDevelopment = process.env.NODE_ENV !== "production";
const distDir = process.env.NEXT_DIST_DIR?.trim();

const inlineScriptHashes = [
  PRELOAD_PROGRESS_SCRIPT,
  THEME_COLOR_SCRIPT,
  JSON.stringify(buildStructuredData(getSiteUrl())),
].map(
  (content) =>
    `'sha256-${createHash("sha256").update(content).digest("base64")}'`,
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
      "https://va.vercel-scripts.com",
    ].join(" ")
  : [
      "script-src",
      "'self'",
      "'strict-dynamic'",
      "'nonce-__NEXT_SCRIPT_NONCE__'",
      ...inlineScriptHashes,
      "https://cdn.jsdelivr.net",
      "https://checkout.razorpay.com",
      "https://va.vercel-scripts.com",
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
  "wss://generativelanguage.googleapis.com",
  "https://cdn.jsdelivr.net",
  "https://checkout.razorpay.com",
  "https://api.razorpay.com",
  "https://vitals.vercel-insights.com",
  "https://va.vercel-scripts.com",
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
  "https://www.youtube-nocookie.com",
].join(" ");

const frameAncestors = isDevelopment
  ? "frame-ancestors 'self' http://localhost:8081 http://127.0.0.1:8081"
  : "frame-ancestors 'none'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.vercel-storage.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://avatar.vercel.sh https://i.ytimg.com https://*.googleusercontent.com https://*.gstatic.com https://*.bing.net https://commons.wikimedia.org https://upload.wikimedia.org ${contactImageOrigin(process.env.SUPABASE_URL)}`.trim(),
      "font-src 'self'",
      "worker-src 'self' blob:",
      connectSrc,
      frameSrc,
      frameAncestors,
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
      "camera=(), microphone=(self), geolocation=(self), payment=(), usb=(), accelerometer=(), autoplay=(self)",
  },
  ...(isDevelopment
    ? []
    : [
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
      ]),
];

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
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
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "mammoth"],
  outputFileTracingIncludes: {
    "/api/chat": [
      "./scripts/chat-document-worker.cjs",
      "./node_modules/pdf-parse/package.json",
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/*.cjs",
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/*.mjs",
      "./node_modules/pdf-parse/dist/worker/cjs/*.cjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
    ],
    "/api/files/upload": [
      "./scripts/chat-document-worker.cjs",
      "./node_modules/pdf-parse/package.json",
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/*.cjs",
      "./node_modules/pdf-parse/dist/pdf-parse/cjs/*.mjs",
      "./node_modules/pdf-parse/dist/worker/cjs/*.cjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/api/chat": [
      "./node_modules/**/pdf-parse/**/*.map",
      "./node_modules/**/pdfjs-dist/**/*.map",
    ],
    "/api/files/upload": [
      "./node_modules/**/pdf-parse/**/*.map",
      "./node_modules/**/pdfjs-dist/**/*.map",
    ],
  },
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
