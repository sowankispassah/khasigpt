import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ExploreImagePlace } from "./image-matching";

const placeSchema = z.object({
  id: z.string().min(1).max(300), name: z.string().min(1).max(1000),
  address: z.string().max(1000).nullable(), website: z.string().max(4096).nullable(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
}).strict();
const payloadSchema = z.object({ userId: z.string(), expires: z.number(), place: placeSchema }).strict();
function secret() {
  const key = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("photo_signing_unavailable");
  return key;
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(`explore-photo-v1:${value}`).digest();
}
export function createPhotoLookupToken(place: ExploreImagePlace, userId: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ place: placeSchema.parse(place), userId, expires: now + 2 * 60 * 60_000 })).toString("base64url");
  return `${body}.${signature(body).toString("base64url")}`;
}
export function readPhotoLookupToken(token: string, userId: string, now = Date.now()): ExploreImagePlace | null {
  try {
    if (token.length > 12_000) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const supplied = Buffer.from(parts[1], "base64url");
    const expected = signature(parts[0]);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(parts[0], "base64url").toString()));
    if (!parsed.success || parsed.data.userId !== userId || parsed.data.expires <= now) return null;
    return parsed.data.place;
  } catch { return null; }
}
