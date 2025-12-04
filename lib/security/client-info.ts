import { headers } from "next/headers";

export type ClientInfo = {
  ipAddress: string | null;
  userAgent: string | null;
  device: string | null;
};

function sanitizeHeaderValue(
  value: string | null | undefined,
  fallback: string | null = null,
  maxLength = 512
): string | null {
  if (!value) {
    return fallback;
  }
  const cleaned = value.replace(/[\r\n]/g, " ").trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.slice(0, maxLength);
}

function detectDeviceFromUserAgent(userAgent: string | null): string | null {
  if (!userAgent) {
    return null;
  }

  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  }
  if (ua.includes("ipad") || ua.includes("tablet")) {
    return "tablet";
  }
  if (ua.includes("macintosh") || ua.includes("windows") || ua.includes("linux")) {
    return "desktop";
  }
  if (ua.includes("bot") || ua.includes("crawl") || ua.includes("spider")) {
    return "bot";
  }

  return "unknown";
}

export function getClientInfoFromHeaders(): ClientInfo {
  try {
    const headerStore = headers();
    const forwardedFor =
      headerStore.get("x-forwarded-for") ?? headerStore.get("forwarded") ?? "";
    const forwardedValue = forwardedFor.split(",")[0]?.trim() ?? "";
    const normalizedForwarded = forwardedValue.startsWith("for=")
      ? forwardedValue.replace(/^for=/i, "").replace(/^['"]|['"]$/g, "")
      : forwardedValue;
    const ipAddress =
      sanitizeHeaderValue(normalizedForwarded, null, 128) ??
      sanitizeHeaderValue(headerStore.get("cf-connecting-ip"), null, 128) ??
      sanitizeHeaderValue(headerStore.get("x-real-ip"), null, 128) ??
      null;

    const userAgent = sanitizeHeaderValue(headerStore.get("user-agent"));
    const device = detectDeviceFromUserAgent(userAgent);

    return {
      ipAddress,
      userAgent,
      device,
    };
  } catch (_error) {
    return {
      ipAddress: null,
      userAgent: null,
      device: null,
    };
  }
}
