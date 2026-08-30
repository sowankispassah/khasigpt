import "server-only";

import { createProductImageToken } from "./product-image-token";
import {
  buildVerifiedShoppingProduct,
  extractProductPageMetadata,
  type ProductPageMetadata,
} from "./products";
import { fetchPublicResource } from "./public-fetch";
import type { WebSearchProduct } from "./types";

const PRODUCT_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_PRODUCT_PAGES = 150;
const PRODUCT_PAGE_TIMEOUT_MS = 5000;
const PRODUCT_PAGE_MAX_BYTES = 1_500_000;

const productPageCache = new Map<
  string,
  { expiresAt: number; metadata: ProductPageMetadata | null }
>();

function cacheProductPage(url: string, metadata: ProductPageMetadata | null) {
  if (productPageCache.size >= MAX_CACHED_PRODUCT_PAGES) {
    const oldestKey = productPageCache.keys().next().value;
    if (typeof oldestKey === "string") {
      productPageCache.delete(oldestKey);
    }
  }
  productPageCache.set(url, {
    expiresAt: Date.now() + PRODUCT_PAGE_CACHE_TTL_MS,
    metadata,
  });
}

async function getProductPageMetadata(url: string) {
  const cached = productPageCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.metadata;
  }
  if (cached) {
    productPageCache.delete(url);
  }

  const result = await fetchPublicResource({
    acceptedContentTypes: ["text/html", "application/xhtml+xml"],
    maxBytes: PRODUCT_PAGE_MAX_BYTES,
    timeoutMs: PRODUCT_PAGE_TIMEOUT_MS,
    url,
  });
  const metadata = result
    ? extractProductPageMetadata({
        finalUrl: result.finalUrl,
        html: new TextDecoder().decode(result.body),
      })
    : null;
  cacheProductPage(url, metadata);
  return metadata;
}

export async function enrichShoppingProducts({
  products,
  userMessage,
}: {
  products: WebSearchProduct[];
  userMessage: string;
}) {
  const verifiedProducts = await Promise.all(
    products.slice(0, 6).map(async (candidate): Promise<WebSearchProduct | null> => {
      const metadata = await getProductPageMetadata(candidate.url);
      if (!metadata) {
        return {
          ...candidate,
          imageProxyToken: null,
          imageUrl: null,
          verified: false,
        };
      }
      const verified = buildVerifiedShoppingProduct({ candidate, metadata, userMessage });
      if (!verified) {
        return {
          ...candidate,
          imageProxyToken: null,
          imageUrl: null,
          verified: false,
        };
      }
      return {
        ...verified,
        imageProxyToken: verified.imageUrl
          ? createProductImageToken(verified.imageUrl)
          : null,
      } satisfies WebSearchProduct;
    })
  );

  return Array.from(
    new Map(
      verifiedProducts
        .filter((product): product is WebSearchProduct => product !== null)
        .map((product) => [product.url, product])
    ).values()
  );
}
