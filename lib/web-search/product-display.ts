import type { WebSearchProduct } from "./types";

export type DisplayWebSearchProduct = Omit<
  WebSearchProduct,
  "imageUrl" | "kind"
> & {
  imageUrl: string | null;
  kind: NonNullable<WebSearchProduct["kind"]>;
};

export function normalizeWebSearchProductForDisplay(
  product: WebSearchProduct
): DisplayWebSearchProduct | null {
  try {
    const url = new URL(product.url);
    const kind: NonNullable<WebSearchProduct["kind"]> =
      product.kind === "collection" ? "collection" : "product";
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !product.title?.trim() ||
      !product.merchant?.trim() ||
      !product.price?.trim() ||
      (kind === "product" && !/\d/.test(product.price))
    ) {
      return null;
    }

    let imageUrl: string | null = null;
    if (
      product.imageUrl &&
      product.imageProxyToken &&
      product.imageProxyToken.length <= 4096 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(product.imageProxyToken)
    ) {
      const candidate = new URL(product.imageUrl);
      imageUrl =
        candidate.protocol === "https:"
          ? `/api/web-search/product-image?token=${encodeURIComponent(product.imageProxyToken)}`
          : null;
    }

    return {
      ...product,
      imageUrl,
      kind,
      merchant: product.merchant.trim(),
      price: product.price.trim(),
      title: product.title.trim(),
      url: url.toString(),
    };
  } catch {
    return null;
  }
}
