import { realpathSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./lib/security/csp";

const isDevelopment = process.env.NODE_ENV !== "production";
const distDir = process.env.NEXT_DIST_DIR?.trim();
// Trace actual package files, not files beneath pnpm aliases: mixing a traced
// directory link with files written inside it produces invalid function output.
const runtimePackageRoot = (name: string) =>
  `./${path
    .relative(
      __dirname,
      realpathSync(path.join(__dirname, "node_modules", name)),
    )
    .split(path.sep)
    .join("/")}`;
const pdfRuntimeRoot = runtimePackageRoot("pdf-parse");
const pdfJsRuntimeRoot = runtimePackageRoot("pdfjs-dist");

// Page CSP (with a per-request script nonce) is set by proxy.ts.
const securityHeaders = [
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
  env: {
    CHAT_DOCUMENT_PDF_ENTRY: `${pdfRuntimeRoot}/dist/pdf-parse/cjs/index.cjs`,
  },
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
    "/api/**/*": ["./lib/payments/fonts/Geist-Regular.ttf"],
    "/api/chat": [
      "./scripts/chat-document-worker.cjs",
      `${pdfRuntimeRoot}/package.json`,
      `${pdfRuntimeRoot}/dist/pdf-parse/cjs/*.cjs`,
      `${pdfRuntimeRoot}/dist/pdf-parse/cjs/*.mjs`,
      `${pdfRuntimeRoot}/dist/worker/cjs/*.cjs`,
      `${pdfJsRuntimeRoot}/legacy/build/pdf.worker.mjs`,
      `${pdfJsRuntimeRoot}/cmaps/**/*`,
      `${pdfJsRuntimeRoot}/standard_fonts/**/*`,
      `${pdfJsRuntimeRoot}/wasm/**/*`,
    ],
    "/api/files/upload": [
      "./scripts/chat-document-worker.cjs",
      `${pdfRuntimeRoot}/package.json`,
      `${pdfRuntimeRoot}/dist/pdf-parse/cjs/*.cjs`,
      `${pdfRuntimeRoot}/dist/pdf-parse/cjs/*.mjs`,
      `${pdfRuntimeRoot}/dist/worker/cjs/*.cjs`,
      `${pdfJsRuntimeRoot}/legacy/build/pdf.worker.mjs`,
      `${pdfJsRuntimeRoot}/cmaps/**/*`,
      `${pdfJsRuntimeRoot}/standard_fonts/**/*`,
      `${pdfJsRuntimeRoot}/wasm/**/*`,
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
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(),
          },
        ],
      },
    ];
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
