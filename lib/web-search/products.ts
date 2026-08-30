import { load } from "cheerio";
import type { WebSearchProduct, WebSearchSource } from "./types";

const PRODUCT_BLOCK_PATTERN =
  /<khasigpt_products>\s*([\s\S]*?)\s*<\/khasigpt_products>/gi;
const MAX_PRODUCTS = 6;
const NON_RETAIL_SOURCE_PATTERN =
  /(?:youtube|youtu\.be|instagram|facebook|wikipedia|reddit|pinterest|quora|linkedin|x\.com|twitter)/i;
const RETAILER_NAMES: Array<[RegExp, string]> = [
  [/\bajio\b/i, "AJIO"],
  [/\bamazon\b/i, "Amazon"],
  [/\bbewakoof\b/i, "Bewakoof"],
  [/\bflipkart\b/i, "Flipkart"],
  [/\bh\s*&\s*m\b|\bhm\.com\b/i, "H&M"],
  [/\bmax\s*fashion\b|\bmaxfashion\b/i, "Max Fashion"],
  [/\bmeesho\b/i, "Meesho"],
  [/\bmyntra\b/i, "Myntra"],
  [/\bnobero\b/i, "Nobero"],
  [/\bsnapdeal\b/i, "Snapdeal"],
  [/\btata\s*cliq\b|\btatacliq\b/i, "Tata CLiQ"],
];
const PRODUCT_IDENTITY_STOPWORDS = new Set([
  "and",
  "buy",
  "for",
  "from",
  "india",
  "men",
  "online",
  "price",
  "shirt",
  "shirts",
  "shop",
  "the",
  "tshirt",
  "tshirts",
  "women",
]);

export type ProductPageMetadata = {
  availability: string | null;
  currency: string | null;
  finalUrl: string;
  imageUrl: string | null;
  merchant: string;
  priceAmount: number;
  rating: number | null;
  reviewCount: string | null;
  title: string;
};

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localhost")
  ) {
    return true;
  }

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }
  const first = Number(ipv4[1]);
  const second = Number(ipv4[2]);
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function normalizePublicUrl(value: unknown, { image = false } = {}) {
  const text = normalizeText(value, 2048);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    if (
      (image ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)) ||
      url.username ||
      url.password ||
      isPrivateHostname(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeProduct(value: unknown): WebSearchProduct | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = normalizeText(record.title, 180);
  const url = normalizePublicUrl(record.url);
  const price = normalizeText(record.price, 48);
  if (!title || !url || !price || !/\d/.test(price)) {
    return null;
  }

  const parsedUrl = new URL(url);
  const merchant =
    normalizeText(record.merchant, 100) ?? parsedUrl.hostname.replace(/^www\./i, "");
  const rawRating =
    typeof record.rating === "number"
      ? record.rating
      : typeof record.rating === "string"
        ? Number(record.rating)
        : Number.NaN;
  const rating =
    Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5
      ? Math.round(rawRating * 10) / 10
      : null;

  return {
    title,
    url,
    merchant,
    price,
    imageUrl: normalizePublicUrl(record.imageUrl, { image: true }),
    rating,
    reviewCount: normalizeText(record.reviewCount, 40),
    availability: normalizeText(record.availability, 80),
  };
}

function parseProductBlock(block: string) {
  const normalized = block
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(normalized) as unknown;
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { products?: unknown }).products)
        ? (parsed as { products: unknown[] }).products
        : [];
    return candidates
      .map(normalizeProduct)
      .filter((product): product is WebSearchProduct => product !== null);
  } catch {
    return [];
  }
}

export function extractShoppingProducts(answer: string) {
  const products: WebSearchProduct[] = [];
  for (const match of answer.matchAll(PRODUCT_BLOCK_PATTERN)) {
    products.push(...parseProductBlock(match[1] ?? ""));
  }

  const uniqueProducts = Array.from(
    new Map(products.map((product) => [product.url, product])).values()
  ).slice(0, MAX_PRODUCTS);
  const cleanAnswer = answer.replace(PRODUCT_BLOCK_PATTERN, "").trim();

  return {
    answer:
      cleanAnswer ||
      uniqueProducts
        .map((product) => `${product.title} — ${product.price} (${product.merchant})`)
        .join("\n"),
    products: uniqueProducts,
  };
}

function getShoppingRequestLabel(userMessage: string) {
  const withoutRequestPrefix = userMessage
    .replace(
      /^\s*(?:please\s+)?(?:find|show|search|look)\s+(?:for\s+)?(?:me\s+)?/i,
      ""
    )
    .replace(/^\s*(?:buy|browse)\s+(?:me\s+)?/i, "")
    .trim();
  const withoutBudget = withoutRequestPrefix
    .replace(
      /\s+\b(?:under|below|less\s+than|up\s+to|max(?:imum)?|within|not\s+more\s+than)\b[\s\S]*$/i,
      ""
    )
    .trim();
  const label = (withoutBudget || withoutRequestPrefix || "products")
    .replace(/\bt\s*-?\s*shirts?\b|\btshirts?\b/gi, "T-shirts")
    .replace(/\s+/g, " ")
    .trim();
  return label.slice(0, 80);
}

function getShoppingBudgetLabel(userMessage: string) {
  const amount = extractMaximumBudget(userMessage);
  if (amount === null) {
    return "Current listings";
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
  return /(?:₹|\brs\.?\b|\brupees?\b|\binr\b)/i.test(userMessage)
    ? `Under ₹${formatted}`
    : `Under ${formatted}`;
}

function getRetailerName(source: WebSearchSource) {
  const identity = `${source.domain ?? ""} ${source.title}`.trim();
  if (!identity || NON_RETAIL_SOURCE_PATTERN.test(identity)) {
    return null;
  }
  for (const [pattern, name] of RETAILER_NAMES) {
    if (pattern.test(identity)) {
      return name;
    }
  }

  const hostnameMatch = identity.match(
    /(?:^|\s)(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{1,62})\.(?:com|in|co\.in|store|shop)(?:\b|\/)/i
  );
  if (hostnameMatch?.[1]) {
    return hostnameMatch[1]
      .split("-")
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" ");
  }

  return null;
}

/**
 * Produces honest browse cards when grounding found retailer pages but the model
 * did not return any trustworthy individual product records. These cards never
 * claim an exact item, price, rating, image, or availability.
 */
export function buildGroundedShoppingFallbacks({
  sources,
  userMessage,
}: {
  sources: WebSearchSource[];
  userMessage: string;
}) {
  const requestLabel = getShoppingRequestLabel(userMessage);
  const price = getShoppingBudgetLabel(userMessage);
  const products = sources.flatMap((source): WebSearchProduct[] => {
    const merchant = getRetailerName(source);
    if (!merchant) {
      return [];
    }
    return [{
      imageProxyToken: null,
      imageUrl: null,
      kind: "collection",
      merchant,
      price,
      title: `Browse ${requestLabel} on ${merchant}`,
      url: source.url,
      verified: false,
    }];
  });

  return Array.from(
    new Map(products.map((product) => [product.merchant.toLowerCase(), product])).values()
  ).slice(0, MAX_PRODUCTS);
}

function collectJsonLdObjects(value: unknown, output: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectJsonLdObjects(entry, output);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  output.push(record);
  if (record["@graph"]) {
    collectJsonLdObjects(record["@graph"], output);
  }
}

function hasSchemaType(record: Record<string, unknown>, expectedType: string) {
  const values = Array.isArray(record["@type"])
    ? record["@type"]
    : [record["@type"]];
  return values.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().split(/[/#]/).at(-1) === expectedType.toLowerCase()
  );
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeText(value, 2048);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const result = firstString(entry);
      if (result) {
        return result;
      }
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstString(record.url) ?? firstString(record.contentUrl) ?? firstString(record.name);
  }
  return null;
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const normalized =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value.replace(/[^\d.-]/g, ""))
          : Number.NaN;
    if (Number.isFinite(normalized) && normalized >= 0) {
      return normalized;
    }
  }
  return null;
}

function resolveHttpsUrl(value: unknown, pageUrl: string) {
  const text = firstString(value);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text, pageUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeAvailability(value: unknown) {
  const text = firstString(value);
  if (!text) {
    return null;
  }
  const label = text.split(/[/#]/).at(-1)?.replace(/([a-z])([A-Z])/g, "$1 $2");
  return normalizeText(label, 80);
}

function findOffer(product: Record<string, unknown>) {
  const candidates: Record<string, unknown>[] = [];
  collectJsonLdObjects(product.offers, candidates);
  return candidates.find(
    (candidate) =>
      firstFiniteNumber(
        candidate.price,
        candidate.lowPrice,
        (candidate.priceSpecification as Record<string, unknown> | undefined)?.price
      ) !== null
  );
}

function parseJsonLdProducts(html: string) {
  const $ = load(html);
  const records: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const text = $(element).text().trim();
    if (!text) {
      return;
    }
    try {
      collectJsonLdObjects(JSON.parse(text), records);
    } catch {
      // A malformed metadata block must not invalidate other product metadata.
    }
  });
  return { $, products: records.filter((record) => hasSchemaType(record, "Product")) };
}

export function extractProductPageMetadata({
  finalUrl,
  html,
}: {
  finalUrl: string;
  html: string;
}): ProductPageMetadata | null {
  const pageUrl = normalizePublicUrl(finalUrl);
  if (!pageUrl) {
    return null;
  }
  const { $, products } = parseJsonLdProducts(html);
  const product = products.find((candidate) => findOffer(candidate)) ?? products[0] ?? null;
  const offer = product ? findOffer(product) : null;
  const priceAmount = firstFiniteNumber(
    offer?.price,
    offer?.lowPrice,
    (offer?.priceSpecification as Record<string, unknown> | undefined)?.price,
    $("meta[property='product:price:amount']").attr("content"),
    $("[itemprop='price']").first().attr("content")
  );
  const title = normalizeText(
    firstString(product?.name) ??
      $("meta[property='og:title']").attr("content") ??
      $("title").text(),
    180
  );
  if (!title || priceAmount === null) {
    return null;
  }

  const currency = normalizeText(
    firstString(offer?.priceCurrency) ??
      firstString(
        (offer?.priceSpecification as Record<string, unknown> | undefined)?.priceCurrency
      ) ??
      $("meta[property='product:price:currency']").attr("content"),
    8
  )?.toUpperCase() ?? null;
  const aggregateRating =
    product?.aggregateRating && typeof product.aggregateRating === "object"
      ? (product.aggregateRating as Record<string, unknown>)
      : null;
  const rating = firstFiniteNumber(aggregateRating?.ratingValue);
  const safeRating = rating !== null && rating <= 5 ? Math.round(rating * 10) / 10 : null;
  const merchant = normalizeText(
    $("meta[property='og:site_name']").attr("content"),
    100
  ) ?? new URL(pageUrl).hostname.replace(/^www\./i, "");
  const imageUrl = resolveHttpsUrl(
    product?.image ??
      $("meta[property='og:image:secure_url']").attr("content") ??
      $("meta[property='og:image']").attr("content") ??
      $("meta[name='twitter:image']").attr("content"),
    pageUrl
  );

  return {
    availability: normalizeAvailability(offer?.availability),
    currency,
    finalUrl: pageUrl,
    imageUrl,
    merchant,
    priceAmount,
    rating: safeRating,
    reviewCount: normalizeText(
      firstString(aggregateRating?.reviewCount) ?? firstString(aggregateRating?.ratingCount),
      40
    ),
    title,
  };
}

function identityTokens(value: string) {
  return new Set(
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !PRODUCT_IDENTITY_STOPWORDS.has(token) &&
          !/^\d+$/.test(token)
      )
  );
}

export function productTitlesMatch(candidateTitle: string, pageTitle: string) {
  const normalizedCandidate = candidateTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedPage = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (
    normalizedCandidate.length >= 12 &&
    normalizedPage.length >= 12 &&
    (normalizedCandidate.includes(normalizedPage) || normalizedPage.includes(normalizedCandidate))
  ) {
    return true;
  }
  const candidateTokens = identityTokens(candidateTitle);
  const pageTokens = identityTokens(pageTitle);
  const intersection = [...candidateTokens].filter((token) => pageTokens.has(token)).length;
  const smallerSetSize = Math.min(candidateTokens.size, pageTokens.size);
  return smallerSetSize > 0 && intersection >= 2 && intersection / smallerSetSize >= 0.5;
}

function extractMaximumBudget(userMessage: string) {
  const match = userMessage.match(
    /\b(?:under|below|less\s+than|up\s+to|max(?:imum)?|within|not\s+more\s+than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (!match?.[1]) {
    return null;
  }
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatPrice(amount: number, currency: string | null) {
  const maximumFractionDigits = Number.isInteger(amount) ? 0 : 2;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      currency: "INR",
      maximumFractionDigits,
      style: "currency",
    }).format(amount);
  }
  const numeric = new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(amount);
  return currency ? `${currency} ${numeric}` : numeric;
}

export function buildVerifiedShoppingProduct({
  candidate,
  metadata,
  userMessage,
}: {
  candidate: WebSearchProduct;
  metadata: ProductPageMetadata;
  userMessage: string;
}): WebSearchProduct | null {
  if (!productTitlesMatch(candidate.title, metadata.title)) {
    return null;
  }
  const maximumBudget = extractMaximumBudget(userMessage);
  const budgetIsRupees = /(?:₹|\brs\.?\b|\brupees?\b|\binr\b)/i.test(userMessage);
  if (
    maximumBudget !== null &&
    ((budgetIsRupees && metadata.currency && metadata.currency !== "INR") ||
      metadata.priceAmount > maximumBudget)
  ) {
    return null;
  }
  return {
    availability: metadata.availability,
    imageUrl: metadata.imageUrl,
    merchant: metadata.merchant,
    price: formatPrice(metadata.priceAmount, metadata.currency),
    rating: metadata.rating,
    reviewCount: metadata.reviewCount,
    title: metadata.title,
    url: metadata.finalUrl,
    verified: true,
  };
}
