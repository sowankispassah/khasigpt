import { extractExploreRadiusKm } from "@/lib/explore/shared";
import type { ExploreLocationInput } from "@/lib/explore/types";

export type ExploreChatContext = {
  categoryQuery: string | null;
  location: ExploreLocationInput;
  query: string;
  radiusKm: number;
};

const GENERIC_NEW_SEARCH_PATTERN = /\b(more|other|another|nearby)\b/i;
const SEARCH_ACTION_PATTERN = /\b(find|show|search|look|discover)\b/i;
const SPECIFIC_PLACE_PATTERN =
  /\b(restaurant|cafe|coffee|hotel|stay|food|shop|market|hospital|clinic|pharmacy|school|college|church|museum|park|waterfall|tourist|attraction|event|sport|experience)s?\b/i;

function finiteCoordinate(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSearchLine(text: string) {
  const match = text.match(/^Current search:\s*(.+?)(?:; category: ([^;\n.]+))?(?:; subcategory: ([^;\n.]+))?\.?$/im);
  if (!match) return { categoryQuery: null, query: "places" };
  const query = match[1]?.trim() || "places";
  const subcategory = match[3]?.trim();
  const category = match[2]?.trim();
  return { categoryQuery: subcategory || category || null, query };
}

export function parseExploreChatContext(
  recentAssistantTexts: string[],
): ExploreChatContext | null {
  for (const text of [...recentAssistantTexts].reverse()) {
    const selectedContext = text.match(
      /Current Explore location:\s*(.+?)\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)\./i,
    );
    const searchContext = text.match(
      /Current Explore context:\s*(.+?)\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\),\s*within\s*(\d+(?:\.\d+)?)\s*km\./i,
    );
    const match = selectedContext ?? searchContext;
    if (!match) continue;

    const latitude = finiteCoordinate(match[2] ?? "");
    const longitude = finiteCoordinate(match[3] ?? "");
    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }

    const explicitRadius = text.match(/Current radius:\s*(\d+(?:\.\d+)?)\s*km\./i);
    const radiusKm = Math.min(
      50,
      Math.max(1, Number(explicitRadius?.[1] ?? searchContext?.[4] ?? 10)),
    );
    const search = parseSearchLine(text);
    return {
      ...search,
      location: {
        id: `chat:${latitude.toFixed(6)}:${longitude.toFixed(6)}`,
        label: match[1]?.trim() || "Selected location",
        latitude,
        longitude,
        accuracy: null,
        source: "manual",
      },
      radiusKm,
    };
  }
  return null;
}

export function resolveExploreChatFollowUp(input: {
  currentText: string;
  recentAssistantTexts: string[];
}) {
  const context = parseExploreChatContext(input.recentAssistantTexts);
  const currentText = input.currentText.trim();
  if (!context) return null;

  const requestedRadius = extractExploreRadiusKm(currentText);
  const hasSpecificPlaceIntent = SPECIFIC_PLACE_PATTERN.test(currentText);
  const startsNewSearch =
    GENERIC_NEW_SEARCH_PATTERN.test(currentText) ||
    (SEARCH_ACTION_PATTERN.test(currentText) &&
      (requestedRadius !== null || hasSpecificPlaceIntent));
  if (!startsNewSearch) return null;

  return {
    ...context,
    query: hasSpecificPlaceIntent ? currentText : context.query,
    radiusKm: requestedRadius ?? context.radiusKm,
  };
}
