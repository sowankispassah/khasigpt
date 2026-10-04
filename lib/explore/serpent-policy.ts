export const SERPENT_MAPS_QUICK_SETTING_KEY = "explore_serpent_maps_quick_enabled";

// Preserve the existing behavior until an admin explicitly changes this option.
export function parseSerpentMapsQuickEnabled(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error("invalid_serpent_maps_quick_setting");
  return value;
}

export function serpentDetailPolicy(enabled: boolean, requested?: "list" | "full") {
  return {
    detailMode: enabled ? requested ?? "full" : "list",
    detailsPending: enabled && requested === "list",
  } as const;
}
