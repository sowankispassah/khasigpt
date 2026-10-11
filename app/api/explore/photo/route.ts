import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { readPhotoLookupToken } from "@/lib/explore/photo-token";
import { getSerpentMapsQuickEnabled, getSerpentPhotoSource } from "@/lib/explore/provider-config";
import { lookupSerpentPlacePhoto } from "@/lib/explore/serpent-images";
import { lookupSerpentListingPhoto } from "@/lib/explore/serpent-place-photo";
import { incrementRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 20;
const schema = z.object({ token: z.string().min(1).max(12_000) }).strict();
export async function POST(request: Request) {
  const headers = noStoreHeaders();
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
    if (!await isExploreMeghalayaEnabledForRole(auth.user.role, auth.user.id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    const place = parsed.success ? readPhotoLookupToken(parsed.data.token, auth.user.id) : null;
    if (!place) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
    const [enabled, source] = await Promise.all([getSerpentMapsQuickEnabled(), getSerpentPhotoSource()]);
    if (!enabled || (source !== "image_search" && source !== "maps_place") ||
      (place.lookupMode === "listing") !== (source === "maps_place")) return NextResponse.json({ error: "unavailable" }, { status: 409, headers });
    const limit = await incrementRateLimit(`explore-photo:${auth.user.id}`, { limit: 60, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
    const photo = source === "maps_place" ? await lookupSerpentListingPhoto(place) : await lookupSerpentPlacePhoto(place);
    return NextResponse.json({ id: place.id, photo }, { headers });
  } catch {
    console.warn("[explore/photos] Optional photo unavailable");
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
}
