import { z } from "zod";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { listForumBlockedUsers, setForumUserBlock } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({ userId: z.string().uuid() });
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function actor(request: Request): Promise<
  | { response: Response; userId: null }
  | { response: null; userId: string }
> {
  const session = await getMobileSession(request);
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return { response: forumDisabledResponse(), userId: null };
  }
  if (!session?.user?.id) {
    return { response: json({ error: "Sign in to manage blocked users." }, 401), userId: null };
  }
  return { response: null, userId: session.user.id };
}

export async function GET(request: Request) {
  const { response, userId } = await actor(request);
  if (response) return response;
  try {
    return json({ users: await listForumBlockedUsers(userId) });
  } catch (error) {
    return forumErrorResponse(error);
  }
}

async function update(request: Request, blocked: boolean) {
  const { response, userId } = await actor(request);
  if (response) return response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid user." }, 400);
  try {
    await setForumUserBlock({ blockerId: userId, blockedId: parsed.data.userId, blocked });
    return json({ ok: true, blocked });
  } catch (error) {
    return forumErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return update(request, true);
}

export async function DELETE(request: Request) {
  return update(request, false);
}
