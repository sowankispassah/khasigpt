export function getClientKeyFromHeaders(headers: Headers): string {
  const forwardedFor =
    headers.get("x-forwarded-for") ?? headers.get("forwarded") ?? "";
  const ip =
    forwardedFor.split(",")[0]?.trim() ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown";
  return ip;
}
