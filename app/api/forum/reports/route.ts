import { z } from "zod";
import { createContactMessage } from "@/lib/db/queries";
import { forumDisabledResponse, forumErrorResponse } from "@/lib/forum/api-helpers";
import { isForumEnabledForRole } from "@/lib/forum/config";
import { getForumReportTarget } from "@/lib/forum/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const reportSchema = z.object({
  threadSlug: z.string().trim().min(1).max(220),
  targetType: z.enum(["thread", "post", "user"]),
  postId: z.string().uuid().optional(),
  reason: z.enum(["harassment", "hate", "sexual", "violence", "spam", "other"]),
  details: z.string().trim().max(2000).optional(),
}).refine((data) =>
  (data.targetType !== "post" || Boolean(data.postId)) &&
  (data.targetType !== "thread" || !data.postId)
);

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!(await isForumEnabledForRole(session?.user?.role ?? null))) {
    return forumDisabledResponse();
  }
  if (!session?.user?.id || !session.user.email) {
    return json({ error: "Sign in to report forum content." }, 401);
  }
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid report." }, 400);
  try {
    const target = await getForumReportTarget(parsed.data);
    const { allowed, resetAt } = await incrementRateLimit(
      `forum-report:${session.user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }
    );
    if (!allowed) {
      return Response.json({ error: "Too many reports. Please try again later." }, {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        },
      });
    }
    const { targetType, reason, details } = parsed.data;
    await createContactMessage({
      kind: "report",
      name: session.user.name?.trim() || "App user",
      email: session.user.email,
      subject: "Forum content report",
      message: [
        `Target: ${targetType}`,
        `Reason: ${reason}`,
        `User details: ${details || "[None provided]"}`,
        `Reporter ID: ${session.user.id}`,
        `Reported user: ${target.authorName} (${target.authorId})`,
        `Thread: ${target.threadTitle} (${target.threadId})`,
        `Post ID: ${target.postId || "[Thread]"}`,
        `Forum URL: https://khasigpt.com/forum/${target.threadSlug}`,
        `Excerpt: ${target.excerpt}`,
      ].join("\n"),
    });
    return json({ ok: true }, 200);
  } catch (error) {
    return forumErrorResponse(error);
  }
}
