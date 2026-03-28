import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type BlobTokenPayload = {
  v: 1;
  url: string;
  key: string;
  userId: string;
  issuedAt: number;
};

const TOKEN_VERSION = 1;

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
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

export function createBlobToken(input: Omit<BlobTokenPayload, "v">): string {
  const secret = getBlobTokenSecret();
  if (!secret) {
    throw new Error("Blob token secret is not configured.");
  }

  const payload: BlobTokenPayload = {
    ...input,
    v: TOKEN_VERSION,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encoded, secret);

  return `${encoded}.${signature}`;
}

export function verifyBlobToken(token: string): BlobTokenPayload | null {
  const secret = getBlobTokenSecret();
  if (!secret) {
    return null;
  }

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
      payload?.v !== TOKEN_VERSION ||
      typeof payload.url !== "string" ||
      typeof payload.key !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.issuedAt !== "number"
    ) {
      return null;
    }

    return payload as BlobTokenPayload;
  } catch {
    return null;
  }
}
