import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type BlobTokenPayload = {
  v: 1 | 2;
  url: string;
  key: string;
  userId: string;
  issuedAt: number;
  expiresAt?: number;
};

const TOKEN_VERSION = 2;
export const BLOB_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;

const getBlobTokenSecret = () =>
  process.env.BLOB_TOKEN_SECRET ??
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "";

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const safeEqual = (a: string, b: string) => {
  if (Buffer.byteLength(a) !== Buffer.byteLength(b)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export function createBlobToken(input: Omit<BlobTokenPayload, "v" | "expiresAt">): string {
  const secret = getBlobTokenSecret();
  if (!secret) {
    throw new Error("Blob token secret is not configured.");
  }

  const payload: BlobTokenPayload = {
    ...input,
    v: TOKEN_VERSION,
    expiresAt: input.issuedAt + BLOB_TOKEN_MAX_AGE_MS,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encoded, secret);

  return `${encoded}.${signature}`;
}

// Only trusted persisted message reads may renew an expired/legacy reference.
// A download token is never sufficient without a current authenticated session.
export function verifyBlobToken(token: string, options: { allowHistorical?: boolean } = {}): BlobTokenPayload | null {
  const secret = getBlobTokenSecret();
  if (!secret) {
    return null;
  }

  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encoded, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const rawPayload = decodeBase64Url(encoded);
    const payload = JSON.parse(rawPayload) as Partial<BlobTokenPayload>;
    if (
      ![1, TOKEN_VERSION].includes(payload?.v ?? 0) ||
      typeof payload.url !== "string" ||
      typeof payload.key !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.issuedAt !== "number" || !Number.isFinite(payload.issuedAt) ||
      payload.issuedAt > Date.now() + 60_000
    ) {
      return null;
    }

    if (payload.v === 2 && (typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) || payload.expiresAt !== payload.issuedAt + BLOB_TOKEN_MAX_AGE_MS)) return null;
    if (!options.allowHistorical && (payload.v !== 2 || (payload.expiresAt ?? 0) <= Date.now())) return null;

    return payload as BlobTokenPayload;
  } catch {
    return null;
  }
}
