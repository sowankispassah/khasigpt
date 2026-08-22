import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { RoutedImageIntent } from "@/lib/image-intent";

const TOKEN_TTL_MS = 2 * 60 * 1000;

type ImageIntentTokenPayload = {
  expiresAt: number;
  intent: RoutedImageIntent;
  promptHash: string;
  userId: string;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required.");
  }
  return secret;
}

function hashPrompt(prompt: string) {
  return createHash("sha256").update(prompt.trim()).digest("base64url");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createImageIntentToken({
  intent,
  prompt,
  userId,
}: {
  intent: RoutedImageIntent;
  prompt: string;
  userId: string;
}) {
  const payload: ImageIntentTokenPayload = {
    expiresAt: Date.now() + TOKEN_TTL_MS,
    intent,
    promptHash: hashPrompt(prompt),
    userId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyImageIntentToken({
  intent,
  prompt,
  token,
  userId,
}: {
  intent: RoutedImageIntent;
  prompt: string;
  token: string;
  userId: string;
}) {
  const [encodedPayload, suppliedSignature] = token.split(".");
  if (!(encodedPayload && suppliedSignature)) {
    return false;
  }

  const expectedSignature = sign(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as ImageIntentTokenPayload;
    return (
      payload.expiresAt >= Date.now() &&
      payload.intent === intent &&
      payload.promptHash === hashPrompt(prompt) &&
      payload.userId === userId
    );
  } catch {
    return false;
  }
}
