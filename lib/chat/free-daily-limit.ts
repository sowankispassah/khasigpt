export function isFreeDailyChatLimitBypassedForTest({
  nodeEnv,
  playwright,
}: {
  nodeEnv: string | undefined;
  playwright: string | undefined;
}) {
  return nodeEnv !== "production" && playwright === "true";
}

export function hasUsableChatCredits(tokenBalance: number) {
  return Number.isFinite(tokenBalance) && tokenBalance > 0;
}

export function requiresPaidWebSearchCredits({
  activeTokenBalance,
  hasActiveCredits,
  minimumCreditTokens,
  testLimitBypass,
  usedFreeDailyAllowance,
}: {
  activeTokenBalance: number;
  hasActiveCredits: boolean;
  minimumCreditTokens: number;
  testLimitBypass: boolean;
  usedFreeDailyAllowance: boolean;
}) {
  if (testLimitBypass || usedFreeDailyAllowance) {
    return false;
  }

  return !hasActiveCredits || activeTokenBalance < minimumCreditTokens;
}
