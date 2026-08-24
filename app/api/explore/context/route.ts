import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { getChatById, saveMessages } from "@/lib/db/queries";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { generateUUID } from "@/lib/utils";

const schema = z.object({
  chatId: z.string().uuid(),
  result: z.object({
    name: z.string().trim().min(1).max(240),
    address: z.string().trim().max(500).nullable().optional(),
    sourceUrl: z.string().url(),
  }),
});

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isExploreMeghalayaEnabledForRole(auth.user.role))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const chat = await getChatById({ id: parsed.data.chatId });
  if (!chat || chat.userId !== auth.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await saveMessages({ messages: [{
    chatId: chat.id,
    id: generateUUID(),
    role: "assistant",
    parts: [{ type: "text", text: `Explore selection context: ${parsed.data.result.name}${parsed.data.result.address ? ` — ${parsed.data.result.address}` : ""}. Source: ${parsed.data.result.sourceUrl}. Treat follow-up questions as referring to this selected result unless the user says otherwise.` }],
    attachments: [],
    createdAt: new Date(),
  }] });
  return NextResponse.json({ ok: true });
}
