import type { ExploreResult } from "./types";

// Detail enrichment must never replace the verified list or its radius/order.
export function mergeExploreDetails(list: ExploreResult[], details: ExploreResult[]) {
  const byId = new Map(details.map((place) => [place.id, place]));
  return list.map((place) => {
    const full = byId.get(place.id);
    if (!full) return place;
    return {
      ...place,
      description: full.description ?? place.description,
      imageUrl: full.imageUrl ?? place.imageUrl,
      openStatus: full.openStatus ?? place.openStatus,
      phone: full.phone ?? place.phone,
      website: full.website ?? place.website,
    };
  });
}
