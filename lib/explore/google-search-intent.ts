const FOOD_TYPES: Record<string, readonly string[]> = {
  restaurant: ["restaurant", "cafe"],
  restaurants: ["restaurant", "cafe"],
  food: ["restaurant", "cafe"],
  dining: ["restaurant", "cafe"],
  eatery: ["restaurant", "cafe"],
  eateries: ["restaurant", "cafe"],
  drink: ["bar", "cafe", "coffee_shop"],
  drinks: ["bar", "cafe", "coffee_shop"],
  cafe: ["cafe", "coffee_shop"],
  cafes: ["cafe", "coffee_shop"],
  coffee: ["cafe", "coffee_shop"],
  "coffee shop": ["cafe", "coffee_shop"],
  "coffee shops": ["cafe", "coffee_shop"],
};

// Only pure category keywords become type filters. Unknown words may be a
// business name, location or condition and must stay in the textual query.
export function googleNearbyFoodTypes(input: { query: string; categoryQuery: string | null }) {
  const terms = [input.categoryQuery, input.query].filter(Boolean).flatMap((value) =>
    (value as string).trim().toLowerCase().replace(/\s+(?:nearby|near me)$/, "")
      .split(/[,;&/]|\band\b/).map((term) => term.trim().replace(/\s+/g, " ")).filter(Boolean),
  );
  if (!terms.length || terms.some((term) => !Object.hasOwn(FOOD_TYPES, term))) return undefined;
  return [...new Set(terms.flatMap((term) => FOOD_TYPES[term]))];
}
