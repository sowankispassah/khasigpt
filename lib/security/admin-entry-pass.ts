import { ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS } from "@/lib/constants";

type AdminEntryPassPayload = {
  exp: number;
  iat: number;
  v: 1;
};

const ADMIN_ENTRY_PASS_TOKEN_VERSION = 1;
const MIN_ADMIN_ENTRY_CODE_LENGTH = 6;
const MAX_ADMIN_ENTRY_CODE_LENGTH = 128;
const encoder = new TextEncoder();

function getAdminEntryPassSecret() {
  const secret =
    process.env.ADMIN_ENTRY_PASS_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "";
  return secret.trim() || null;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return base64ToBytes(padded);
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function signPayload(payload: string, secret: string) {
  const key = await importSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

async function verifyPayloadSignature(
  payload: string,
  signature: string,
  secret: string
) {
  const key = await importSigningKey(secret, ["verify"]);
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(payload)
  );
}

function parsePayload(encodedPayload: string): AdminEntryPassPayload | null {
  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(payloadBytes)
    ) as Partial<AdminEntryPassPayload> | null;

    if (
      parsed?.v !== ADMIN_ENTRY_PASS_TOKEN_VERSION ||
      typeof parsed.exp !== "number" ||
      !Number.isFinite(parsed.exp) ||
      typeof parsed.iat !== "number" ||
      !Number.isFinite(parsed.iat)
    ) {
      return null;
    }

    return {
      v: ADMIN_ENTRY_PASS_TOKEN_VERSION,
      exp: parsed.exp,
      iat: parsed.iat,
    };
  } catch {
    return null;
  }
}

export async function createAdminEntryPassToken(
  expiresInSeconds = ADMIN_ENTRY_PASS_COOKIE_MAX_AGE_SECONDS
) {
  const secret = getAdminEntryPassSecret();
  if (!secret) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = nowSeconds + Math.max(1, Math.floor(expiresInSeconds));
  const payload: AdminEntryPassPayload = {
    v: ADMIN_ENTRY_PASS_TOKEN_VERSION,
    iat: nowSeconds,
    exp: expiresAtSeconds,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyAdminEntryPassToken(token: string | null | undefined) {
  if (typeof token !== "string" || token.trim().length === 0) {
    return null;
  }

  const secret = getAdminEntryPassSecret();
  if (!secret) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const signatureValid = await verifyPayloadSignature(
    encodedPayload,
    signature,
    secret
  );
  if (!signatureValid) {
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return null;
  }

  return payload;
}

export function normalizeAdminEntryCodeInput(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (
    normalized.length < MIN_ADMIN_ENTRY_CODE_LENGTH ||
    normalized.length > MAX_ADMIN_ENTRY_CODE_LENGTH
  ) {
    return null;
  }

  return normalized;
}
