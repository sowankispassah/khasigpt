import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import {
  ExploreLocationError,
  resolveManualExploreLocation,
  reverseGeocodeExploreLocation,
} from "@/lib/explore/location-service";
import { exploreLocationRequestSchema } from "@/lib/explore/validation";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isExploreMeghalayaEnabledForRole(auth.user.role))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = exploreLocationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: noStoreHeaders() },
    );
  }
  const rateLimit = await incrementRateLimit(
    `explore-location:${auth.user.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 12, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: noStoreHeaders() },
    );
  }

  try {
    const location =
      parsed.data.mode === "manual"
        ? await resolveManualExploreLocation(parsed.data.query)
        : await reverseGeocodeExploreLocation({
            accuracy: parsed.data.accuracy ?? null,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
          });
    return NextResponse.json({ location }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof ExploreLocationError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.code === "location_provider_unavailable" ? 503 : 422, headers: noStoreHeaders() },
      );
    }
    console.error("[api/explore/location] Location resolution failed.", error);
    return NextResponse.json(
      {
        error: "location_provider_unavailable",
        message: "Location search is temporarily unavailable. Please try again.",
      },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
