const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);
const MAX_STRING_UNWRAP_ATTEMPTS = 3;

function normalizeBooleanString(value: string) {
  let normalized = value.trim();

  for (let attempt = 0; attempt < MAX_STRING_UNWRAP_ATTEMPTS; attempt++) {
    if (!normalized) {
      return normalized;
    }

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (typeof parsed !== "string") {
        break;
      }
      normalized = parsed.trim();
    } catch {
      break;
    }
  }

  return normalized
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .toLowerCase();
}

export function parseBooleanSetting(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = normalizeBooleanString(value);
  if (!normalized) {
    return fallback;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
}
