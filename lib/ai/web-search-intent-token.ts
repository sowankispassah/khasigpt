import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ToolIntentDecision } from "@/lib/tool-intent";

const TOKEN_TTL_MS = 2 * 60 * 1000;

type ToolIntentTokenPayload = {
  decision: ToolIntentDecision;
  expiresAt: number;
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

export function createToolIntentToken({
  decision,
  prompt,
  userId,
}: {
  decision: ToolIntentDecision;
  prompt: string;
  userId: string;
}) {
  const payload: ToolIntentTokenPayload = {
    decision,
    expiresAt: Date.now() + TOKEN_TTL_MS,
    promptHash: hashPrompt(prompt),
    userId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyToolIntentToken({
  prompt,
  token,
  userId,
}: {
  prompt: string;
  token: string;
  userId: string;
}): ToolIntentDecision | null {
  const [encodedPayload, suppliedSignature] = token.split(".");
  if (!(encodedPayload && suppliedSignature)) {
    return null;
  }
  const expectedSignature = sign(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as ToolIntentTokenPayload;
    if (
      payload.expiresAt < Date.now() ||
      payload.promptHash !== hashPrompt(prompt) ||
      payload.userId !== userId
    ) {
      return null;
    }
    return payload.decision;
  } catch {
    return null;
  }
}
