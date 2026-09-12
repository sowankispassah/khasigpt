import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLogEntry, getUserById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { createPersonalKnowledgeEntry, deletePersonalKnowledgeEntry, listPersonalKnowledgeForUser, updatePersonalKnowledgeEntry } from "@/lib/rag/service";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const saveSchema = z.object({ id: z.string().uuid().nullable().optional(), title: z.string().trim().min(3).max(200), content: z.string().trim().min(16).max(50_000) });
const deleteSchema = z.object({ id: z.string().uuid() });

async function requirePersonalKnowledge(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) return { error: new ChatSDKError("unauthorized:api").toResponse() } as const;
  const user = await getUserById(session.user.id);
  if (!user?.allowPersonalKnowledge) return { error: NextResponse.json({ error: "Personal knowledge is not enabled for your account." }, { status: 403 }) } as const;
  return { session } as const;
}

export async function GET(request: Request) {
  const context = await requirePersonalKnowledge(request);
  if ("error" in context) return context.error;
  const entries = await listPersonalKnowledgeForUser(context.session.user.id);
  return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await requirePersonalKnowledge(request);
  if ("error" in context) return context.error;
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.at(0)?.message ?? "Invalid entry." }, { status: 400 });
  const entry = parsed.data.id ? await updatePersonalKnowledgeEntry({ userId: context.session.user.id, entryId: parsed.data.id, title: parsed.data.title, content: parsed.data.content }) : await createPersonalKnowledgeEntry({ userId: context.session.user.id, title: parsed.data.title, content: parsed.data.content });
  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({ actorId: context.session.user.id, action: parsed.data.id ? "user.personal_knowledge.update" : "user.personal_knowledge.create", target: { entryId: entry.id }, subjectUserId: context.session.user.id, metadata: { client: "native" }, ...clientInfo });
  return NextResponse.json({ entry });
}

export async function DELETE(request: Request) {
  const context = await requirePersonalKnowledge(request);
  if ("error" in context) return context.error;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid entry." }, { status: 400 });
  await deletePersonalKnowledgeEntry({ entryId: parsed.data.id, actorId: context.session.user.id });
  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({ actorId: context.session.user.id, action: "user.personal_knowledge.delete", target: { entryId: parsed.data.id }, subjectUserId: context.session.user.id, metadata: { client: "native" }, ...clientInfo });
  return NextResponse.json({ ok: true });
}
