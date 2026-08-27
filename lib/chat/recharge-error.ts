const RECHARGE_REQUIRED_CHAT_ERROR_CODES = new Set([
  "payment_required:credits",
  "payment_required:free_messages",
  "rate_limit:chat",
]);

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    code?: unknown;
    surface?: unknown;
    type?: unknown;
  };
  if (typeof candidate.code === "string") {
    return candidate.code;
  }
  if (
    typeof candidate.type === "string" &&
    typeof candidate.surface === "string"
  ) {
    return `${candidate.type}:${candidate.surface}`;
  }

  return null;
}

export function isRechargeRequiredChatError(error: unknown) {
  const errorCode = getErrorCode(error);
  if (
    errorCode &&
    RECHARGE_REQUIRED_CHAT_ERROR_CODES.has(errorCode)
  ) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /(?:credits?|recharge|upgrade|free (?:daily )?chats?|maximum number of messages|daily (?:chat|message) limit)/i.test(
    message
  );
}
