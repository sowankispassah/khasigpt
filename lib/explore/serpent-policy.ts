export const SERPENT_MAPS_QUICK_SETTING_KEY = "explore_serpent_maps_quick_enabled";
export const SERPENT_PHOTO_SOURCE_SETTING_KEY = "explore_serpent_photo_source";
export const SERPENT_PHOTO_SOURCES = ["maps_quick", "image_search", "maps_place"] as const;
export type SerpentPhotoSource = (typeof SERPENT_PHOTO_SOURCES)[number];
export function parseSerpentPhotoSource(value: unknown): SerpentPhotoSource {
  if (value === undefined) return "maps_quick";
  if (value === "maps_quick" || value === "image_search" || value === "maps_place") return value;
  throw new Error("invalid_photo_source");
}

// Preserve the existing behavior until an admin explicitly changes this option.
export function parseSerpentMapsQuickEnabled(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "boolean") throw new Error("invalid_serpent_maps_quick_setting");
  return value;
}

export function serpentDetailPolicy(enabled: boolean, requested?: "list" | "full", source: SerpentPhotoSource = "maps_quick") {
  return {
    detailMode: enabled && source === "maps_quick" ? requested ?? "full" : "list",
    detailsPending: enabled && source === "maps_quick" && requested === "list",
    // Existing web/native consumers use the same scoped lazy-photo contract.
    imageSearch: enabled && source !== "maps_quick",
    photoLookupSource: enabled && source !== "maps_quick" ? source : undefined,
  } as const;
}
