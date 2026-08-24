export const EXPLORE_SEARCH_TYPES = ["local", "web", "hybrid"] as const;
export type ExploreSearchType = (typeof EXPLORE_SEARCH_TYPES)[number];

export const EXPLORE_LOCATION_MODES = [
  "current_preferred",
  "selected",
  "meghalaya_wide",
  "current_or_selected",
] as const;
export type ExploreLocationMode = (typeof EXPLORE_LOCATION_MODES)[number];

export const EXPLORE_RESULT_TYPES = [
  "business",
  "place",
  "restaurant",
  "event",
  "sports",
  "experience",
  "standard",
] as const;
export type ExploreResultType = (typeof EXPLORE_RESULT_TYPES)[number];

export type ExploreSubcategoryDto = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  iconName: string;
  searchQuery: string;
  searchTypeOverride: ExploreSearchType | null;
  locationModeOverride: ExploreLocationMode | null;
  isEnabled: boolean;
  displayOrder: number;
};

export type ExploreCategoryDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconName: string;
  searchType: ExploreSearchType;
  searchQuery: string;
  locationMode: ExploreLocationMode;
  resultType: ExploreResultType;
  suggestedPrompts: string[];
  isEnabled: boolean;
  showOnHome: boolean;
  displayOrder: number;
  subcategories: ExploreSubcategoryDto[];
};

export type ExploreLocationInput = {
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
};

export type ExploreResult = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  address: string | null;
  distance: string | null;
  rating: number | null;
  reviewCount: number | null;
  openStatus: string | null;
  eventDate: string | null;
  phone: string | null;
  website: string | null;
  directionsUrl: string | null;
  imageUrl: string | null;
  sourceTitle: string;
  sourceUrl: string;
};

export type ExploreSearchResponse = {
  answer: string;
  category: Pick<ExploreCategoryDto, "id" | "name" | "resultType"> | null;
  chatId: string;
  locationLabel: string | null;
  results: ExploreResult[];
  searchQueries: string[];
};
