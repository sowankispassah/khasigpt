import { extractMaximumBudget, getShoppingRequestLabel, normalizeProductImageUrl } from "./products";
import type { WebSearchProduct } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function words(value: string) {
  return value.toLowerCase().replace(/\bt[\s-]?shirts?\b|\btees?\b/g, "tshirt")
    .replace(/[^a-z0-9]+/g, " ").split(" ").map(word => word.replace(/s$/, ""))
    .filter(word => word.length >= 3 && !/^(?:find|show|search|best|buy|for|the|with|and|india|indian|online|please|men|women|under|rupee|inr)$/.test(word));
}

export function buildSerpentProductQuery(userMessage: string) {
  const label = getShoppingRequestLabel(userMessage).replace(/\s+in\s+India\b.*$/i, "").trim();
  const budget = extractMaximumBudget(userMessage);
  return `${label}${budget === null ? "" : ` under ${budget} rupees`}`.slice(0, 300);
}

/** Photos, prices and URLs must belong to the same returned item. */
export function parseSerpentAmazonProducts(payload: unknown, userMessage: string): WebSearchProduct[] {
  const root = record(payload);
  if (root.success !== true || !Array.isArray(root.results)) return [];
  const wanted = [...new Set(words(getShoppingRequestLabel(userMessage)))];
  const maximum = extractMaximumBudget(userMessage);
  const products: WebSearchProduct[] = [];
  const seen = new Set<string>();
  for (const value of root.results.slice(0, 100)) {
    const item = record(value);
    if (typeof item.title !== "string" || typeof item.url !== "string" ||
      typeof item.price !== "number" || !Number.isFinite(item.price) || item.price <= 0 ||
      item.currency !== "INR" || (maximum !== null && item.price > maximum)) continue;
    const title = item.title.replace(/\s+/g, " ").trim().slice(0, 180);
    const titleWords = new Set(words(title));
    if (!wanted.length || wanted.filter(word => titleWords.has(word)).length < Math.min(2, wanted.length)) continue;
    const imageUrl = normalizeProductImageUrl(item.image);
    if (!imageUrl) continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password ||
      !["amazon.in", "www.amazon.in"].includes(url.hostname) ||
      !/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(url.pathname) || seen.has(url.href)) continue;
    seen.add(url.href);
    products.push({
      kind: "product", title, url: url.href, merchant: "Amazon",
      price: new Intl.NumberFormat("en-IN", {style:"currency", currency:"INR", maximumFractionDigits:2}).format(item.price),
      imageUrl, verified: false,
      rating: typeof item.rating === "number" && item.rating >= 0 && item.rating <= 5 ? item.rating : null,
      reviewCount: typeof item.ratings_total === "number" && Number.isFinite(item.ratings_total) && item.ratings_total >= 0 ? String(item.ratings_total) : null,
      availability: typeof item.delivery === "string" ? item.delivery.slice(0, 80) : null,
    });
    if (products.length === 6) break;
  }
  return products;
}
