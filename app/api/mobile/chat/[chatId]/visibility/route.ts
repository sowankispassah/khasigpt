import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  updateChatVisiblityById,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const visibilitySchema = z.object({
  visibility: z.enum(["private", "public"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId } = await params;
  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = visibilitySchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  await updateChatVisiblityById({
    chatId,
    visibility: payload.data.visibility,
  });

  return NextResponse.json({ ok: true });
}
