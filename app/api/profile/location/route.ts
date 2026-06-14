import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createAuditLogEntry, updateUserLocation } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const locationSchema = z.object({
  accuracy: z.number().finite().nullable().optional(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const parsed = locationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid coordinates." },
      { status: 400 }
    );
  }

  await updateUserLocation({
    id: session.user.id,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    accuracy:
      typeof parsed.data.accuracy === "number" ? parsed.data.accuracy : null,
    consent: true,
  });

  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({
    actorId: session.user.id,
    action: "user.location.update",
    target: { userId: session.user.id },
    metadata: {
      accuracy: parsed.data.accuracy ?? undefined,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    },
    subjectUserId: session.user.id,
    ...clientInfo,
  });

  revalidatePath("/profile");

  return NextResponse.json({
    ok: true,
    updatedAt: new Date().toISOString(),
  });
}
