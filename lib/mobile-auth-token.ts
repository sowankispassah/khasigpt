import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 2 * 60 * 1000;
const PERSISTENT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;

function base64UrlEncode(value: string | Buffer) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(
    padded.replaceAll("-", "+").replaceAll("_", "/"),
    "base64"
  ).toString("utf8");
}

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required.");
  }
  return secret;
}

function sign(value: string) {
  return base64UrlEncode(createHmac("sha256", getSecret()).update(value).digest());
}

export function createMobileAuthToken(
  userId: string,
  options?: { persistent?: boolean }
) {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      exp:
        Date.now() +
        (options?.persistent ? PERSISTENT_TOKEN_TTL_MS : TOKEN_TTL_MS),
    })
  );
  return `${payload}.${sign(payload)}`;
}

export function createJobPreviewToken(jobId: string) {
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: Date.now() + PREVIEW_TOKEN_TTL_MS,
      jobId,
      type: "job-preview",
    })
  );
  return `${payload}.${sign(payload)}`;
}

export function verifyMobileAuthToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      exp?: unknown;
      sub?: unknown;
    };
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < Date.now()) {
      return null;
    }
    return {
      userId: parsed.sub,
    };
  } catch {
    return null;
  }
}

export function verifyJobPreviewToken(token: string, expectedJobId: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      exp?: unknown;
      jobId?: unknown;
      type?: unknown;
    };
    return (
      parsed.type === "job-preview" &&
      typeof parsed.jobId === "string" &&
      parsed.jobId === expectedJobId &&
      typeof parsed.exp === "number" &&
      parsed.exp >= Date.now()
    );
  } catch {
    return false;
  }
}
