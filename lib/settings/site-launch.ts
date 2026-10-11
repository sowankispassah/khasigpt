import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

export type LegacySiteLaunchMode = "admin_only" | "disabled" | "enabled";

export function parseLegacySiteLaunchMode(value: unknown) {
  let current = value;

  for (let index = 0; index < 4; index += 1) {
    if (typeof current !== "string") {
      break;
    }

    const normalized = current
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .toLowerCase();
    if (normalized === "admin_only") {
      return "admin_only" satisfies LegacySiteLaunchMode;
    }
    if (normalized === "enabled" || normalized === "true") {
      return "enabled" satisfies LegacySiteLaunchMode;
    }
    if (normalized === "disabled" || normalized === "false") {
      return "disabled" satisfies LegacySiteLaunchMode;
    }

    try {
      current = JSON.parse(current) as unknown;
    } catch {
      break;
    }
  }

  return null;
}

export function resolvePublicLaunchedSetting({
  fallback,
  legacyMode,
  value,
}: {
  fallback: boolean;
  legacyMode: LegacySiteLaunchMode | null;
  value: unknown;
}) {
  const legacyFallback =
    legacyMode === "enabled"
      ? true
      : legacyMode === "admin_only" || legacyMode === "disabled"
        ? false
        : fallback;

  return parseBooleanSetting(value, legacyFallback);
}

export function resolveAdminAccessEnabledSetting({
  fallback,
  legacyMode,
  value,
}: {
  fallback: boolean;
  legacyMode: LegacySiteLaunchMode | null;
  value: unknown;
}) {
  const legacyFallback = legacyMode === "admin_only" ? true : fallback;
  return parseBooleanSetting(value, legacyFallback);
}
