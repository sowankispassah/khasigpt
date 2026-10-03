import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return true;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

function isPrivateIp(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

export function normalizePublicHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      (isIP(hostname) > 0 && isPrivateIp(hostname))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function hostnameResolvesPublicly(hostname: string) {
  if (isIP(hostname) > 0) {
    return !isPrivateIp(hostname);
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address));
  } catch {
    return false;
  }
}

async function readBoundedBody(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null;
  }
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export type PublicFetchResult = {
  body: Uint8Array;
  contentType: string;
  finalUrl: string;
};

export async function fetchPublicResource({
  acceptedContentTypes,
  maxBytes,
  timeoutMs,
  url,
}: {
  acceptedContentTypes: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  url: string;
}): Promise<PublicFetchResult | null> {
  let currentUrl = normalizePublicHttpUrl(url);
  if (!currentUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!(await hostnameResolvesPublicly(currentUrl.hostname))) {
        return null;
      }
      const response = await fetch(currentUrl, {
        cache: "no-store",
        headers: {
          accept: acceptedContentTypes.join(","),
          "user-agent":
            "Mozilla/5.0 (compatible; KhasiGPT/1.0; +https://khasigpt.com)",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          return null;
        }
        currentUrl = normalizePublicHttpUrl(new URL(location, currentUrl).toString());
        if (!currentUrl) {
          return null;
        }
        continue;
      }
      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (
        !contentType ||
        !acceptedContentTypes.some((accepted) => contentType === accepted)
      ) {
        return null;
      }
      const body = await readBoundedBody(response, maxBytes);
      if (!body) {
        return null;
      }
      return { body, contentType, finalUrl: currentUrl.toString() };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
  return null;
}
