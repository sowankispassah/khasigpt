import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

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

export function createMobileGoogleOAuthState() {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const payload = base64UrlEncode(
    JSON.stringify({
      codeVerifier,
      exp: Date.now() + STATE_TTL_MS,
      nonce: randomUUID(),
      type: "mobile-google-oauth",
    })
  );
  return {
    codeChallenge: base64UrlEncode(
      createHash("sha256").update(codeVerifier).digest()
    ),
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
      codeVerifier?: unknown;
      exp?: unknown;
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
      codeVerifier:
        typeof parsed.codeVerifier === "string" ? parsed.codeVerifier : null,
    };
  } catch {
    return null;
  }
}
