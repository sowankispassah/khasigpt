import "server-only";

import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPT_ID_LENGTH = 80;

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

function normalizeAttemptId(attemptId: string | null | undefined) {
  const normalized = attemptId?.replace(/[^a-zA-Z0-9._-]/g, "").slice(
    0,
    MAX_ATTEMPT_ID_LENGTH
  );
  return normalized || randomUUID();
}

export function createMobileGoogleOAuthState(attemptId?: string | null) {
  const issuedAt = Date.now();
  const normalizedAttemptId = normalizeAttemptId(attemptId);
  const payload = base64UrlEncode(
    JSON.stringify({
      attemptId: normalizedAttemptId,
      exp: issuedAt + STATE_TTL_MS,
      issuedAt,
      nonce: randomUUID(),
      type: "mobile-google-oauth",
    })
  );
  return {
    attemptId: normalizedAttemptId,
    state: `${payload}.${sign(payload)}`,
  };
}

export function verifyMobileGoogleOAuthState(state: string | null) {
  if (!state) {
    return false;
  }

  const [payload, signature] = state.split(".");
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
      attemptId?: unknown;
      exp?: unknown;
      issuedAt?: unknown;
      type?: unknown;
    };
    if (
      parsed.type !== "mobile-google-oauth" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Date.now()) {
      return null;
    }
    return {
      attemptId:
        typeof parsed.attemptId === "string" ? parsed.attemptId : "unknown",
      issuedAt:
        typeof parsed.issuedAt === "number" ? parsed.issuedAt : null,
    };
  } catch {
    return null;
  }
}
