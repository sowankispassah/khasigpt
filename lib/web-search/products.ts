import type { WebSearchProduct } from "./types";

const PRODUCT_BLOCK_PATTERN =
  /<khasigpt_products>\s*([\s\S]*?)\s*<\/khasigpt_products>/gi;
const MAX_PRODUCTS = 6;

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
