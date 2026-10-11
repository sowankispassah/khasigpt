export function sanitizeRedirectPath(
  value: string | null | undefined,
  origin: string,
  fallback = "/"
): string {
  if (!value) {
    return fallback;
  }

  try {
    const resolved = new URL(value, origin);
    if (resolved.origin !== origin) {
      return fallback;
    }
    const nextPath = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    // A same-origin input such as "/.//evil.com" normalizes to "//evil.com",
    // which browsers and new URL(path, origin) treat as another host.
    if (!nextPath.startsWith("/") || /^\/[/\\]/.test(nextPath)) {
      return fallback;
    }
    return nextPath;
  } catch {
    return fallback;
  }
}

export function resolveRedirectUrl(
  value: string | null | undefined,
  baseUrl: string,
  fallback = "/"
): string {
  const origin = new URL(baseUrl).origin;
  const safePath = sanitizeRedirectPath(value, origin, fallback);
  return new URL(safePath, origin).toString();
}
