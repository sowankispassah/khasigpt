import { isIP } from "node:net";

export function getClientKeyFromHeaders(headers: Headers): string {
  // Vercel overwrites these forwarding headers at its trusted ingress. Outside
  // Vercel the hosting proxy must strip incoming forwarding headers itself.
  const trusted = process.env.VERCEL === "1"
    ? ["x-vercel-forwarded-for", "x-forwarded-for"]
    : ["x-forwarded-for", "cf-connecting-ip", "x-real-ip"];
  for (const name of trusted) {
    const value = headers.get(name)?.split(",", 1)[0]?.trim().toLowerCase();
    if (value && isIP(value)) return value;
  }
  return "unknown";
}
