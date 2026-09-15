import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

type ProductImageTokenPayload = {
  issuedAt: number;
  url: string;
  v: 1;
};

const MAX_TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret() {
  return (
    process.env.PRODUCT_IMAGE_TOKEN_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    ""
  );
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createProductImageToken(url: string) {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  const payload: ProductImageTokenPayload = { issuedAt: Date.now(), url, v: 1 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyProductImageToken(token: string) {
  const secret = getSecret();
  const [encoded, signature] = token.split(".");
  if (!secret || !encoded || !signature) {
    return null;
  }
  const expected = sign(encoded, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<ProductImageTokenPayload>;
    const age = Date.now() - (payload.issuedAt ?? 0);
    if (
      payload.v !== 1 ||
      typeof payload.url !== "string" ||
      typeof payload.issuedAt !== "number" ||
      age < -60_000 ||
      age > MAX_TOKEN_AGE_MS
    ) {
      return null;
    }
    return payload.url;
  } catch {
    return null;
  }
}
