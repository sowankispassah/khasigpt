import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createAuditLogEntry, updateUserPassword } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const passwordSchema = z
  .object({
    confirmPassword: z.string().min(8),
    password: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const parsed = passwordSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid password." },
      { status: 400 }
    );
  }

  await updateUserPassword({
    id: session.user.id,
    password: parsed.data.password,
  });

  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({
    actorId: session.user.id,
    action: "user.profile.password.update",
    target: { userId: session.user.id },
    subjectUserId: session.user.id,
    ...clientInfo,
  });

  revalidatePath("/profile");

  return NextResponse.json({ ok: true });
}
