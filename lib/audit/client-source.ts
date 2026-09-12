export type AuditClientSource =
  | "android_native"
  | "ios_native"
  | "mobile_browser"
  | "desktop_browser"
  | "browser"
  | "bot"
  | "unknown";

type AuditClientSourceInput = {
  clientSource?: unknown;
  device?: unknown;
  metadata?: unknown;
  userAgent?: unknown;
};

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function resolveAuditClientSource({
  clientSource,
  device,
  metadata,
  userAgent,
}: AuditClientSourceInput): AuditClientSource {
  const metadataRecord = asRecord(metadata);
  const explicitSource = normalize(
    clientSource ??
      metadataRecord?.clientSource ??
      metadataRecord?.client ??
      metadataRecord?.source
  );
  const platform = normalize(metadataRecord?.platform);
  const ua = normalize(userAgent);
  const normalizedDevice = normalize(device);

  if (
    explicitSource.includes("android") ||
    platform === "android" ||
    ua.includes("okhttp/")
  ) {
    return "android_native";
  }
  if (
    explicitSource.includes("ios") ||
    platform === "ios" ||
    explicitSource === "iphone_native"
  ) {
    return "ios_native";
  }
  if (explicitSource === "native" || explicitSource === "mobile_native") {
    // KhasiGPT currently distributes the native client on Android.
    return "android_native";
  }
  if (
    explicitSource.includes("mobile_browser") ||
    explicitSource.includes("mobile-web")
  ) {
    return "mobile_browser";
  }
  if (
    explicitSource.includes("desktop_browser") ||
    explicitSource.includes("desktop-web")
  ) {
    return "desktop_browser";
  }
  if (
    explicitSource === "bot" ||
    ua.includes("bot") ||
    ua.includes("crawl") ||
    ua.includes("spider")
  ) {
    return "bot";
  }
  if (
    ua.includes("mobile") ||
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    normalizedDevice === "mobile" ||
    normalizedDevice === "tablet"
  ) {
    return "mobile_browser";
  }
  if (
    ua.includes("macintosh") ||
    ua.includes("windows") ||
    ua.includes("linux") ||
    normalizedDevice === "desktop"
  ) {
    return "desktop_browser";
  }
  if (explicitSource.includes("browser") || explicitSource === "web" || ua) {
    return "browser";
  }
  return "unknown";
}
