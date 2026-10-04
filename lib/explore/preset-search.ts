type SearchPreset = { name: string; searchQuery: string };

// Category labels are display text, not additional provider search terms.
// Accept labels from older app versions as well as the internal preset query.
export function resolveExplorePreset(
  query: string,
  category: SearchPreset | null,
  subcategory: SearchPreset | null,
) {
  const preset = subcategory ?? category;
  const normalized = query.trim();
  const isPreset = Boolean(preset && [preset.name, preset.searchQuery]
    .some((value) => value.trim().toLowerCase() === normalized.toLowerCase()));
  return {
    query: isPreset && preset ? preset.searchQuery : normalized,
    categoryQuery: isPreset ? null : preset?.searchQuery ?? null,
    isPreset,
  };
}
