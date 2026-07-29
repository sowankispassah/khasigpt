import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import { getLiteAppSettingUncached } from "@/lib/db/app-settings-lite";
import { retrieveRagContext } from "@/lib/rag/retrieval";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(2).max(2_000),
  scope: z.enum(["default", "study", "jobs"]).optional().default("default"),
});

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return Response.json(
      { message: "Unauthorized" },
      { headers: noStoreHeaders(), status: 401 },
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const rateLimit = await incrementRateLimit(
    `rag-search:${authContext.user.id}:${clientKey}`,
    { limit: 60, windowMs: 5 * 60 * 1_000 },
  );
  if (!rateLimit.allowed) {
    return Response.json(
      { message: "Too many knowledge searches. Please try again shortly." },
      {
        headers: {
          ...noStoreHeaders(),
          "Retry-After": Math.max(
            1,
            Math.ceil((rateLimit.resetAt - Date.now()) / 1_000),
          ).toString(),
        },
        status: 429,
      },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { message: "A valid knowledge query is required." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  const customKnowledgeEnabled = parseBooleanSetting(
    await getLiteAppSettingUncached<string | boolean>(
      CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
    ).catch(() => null),
    false,
  );
  if (!customKnowledgeEnabled) {
    return Response.json(
      { found: false, context: "", sources: [] },
      { headers: noStoreHeaders() },
    );
  }

  const result = await retrieveRagContext({
    query: parsed.data.query,
    scope: parsed.data.scope,
    userId: authContext.user.id,
    modelKey: "gemini-live",
    signal: request.signal,
  });

  return Response.json(
    {
      found: result.status === "hit",
      context: result.context,
      sources: result.matches.map((match) => ({
        title: match.title,
        sourceUrl: match.sourceUrl,
      })),
    },
    { headers: noStoreHeaders() },
  );
}
