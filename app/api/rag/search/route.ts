import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { retrieveRagContext } from "@/lib/rag/retrieval";
import { loadCustomKnowledgeEnabledCached } from "@/lib/rag/runtime-settings";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(2).max(2_000),
  scope: z.enum(["default", "study", "jobs"]).optional().default("default"),
});

type PhaseName = "auth" | "body" | "rateLimit" | "retrieval" | "setting";
type PhaseDurations = Partial<Record<PhaseName, number>>;

async function measurePhase<T>(
  phases: PhaseDurations,
  name: PhaseName,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    phases[name] = Math.round(performance.now() - startedAt);
  }
}

function createTimingHeaders({
  phases,
  requestId,
  totalMs,
}: {
  phases: PhaseDurations;
  requestId: string;
  totalMs: number;
}) {
  const metrics = [
    ["auth", phases.auth],
    ["body", phases.body],
    ["setting", phases.setting],
    ["rate_limit", phases.rateLimit],
    ["retrieval", phases.retrieval],
    ["total", totalMs],
  ] as const;
  return {
    ...noStoreHeaders(),
    "Server-Timing": metrics
      .flatMap(([name, duration]) =>
        Number.isFinite(duration) ? [`${name};dur=${duration}`] : [],
      )
      .join(", "),
    "X-Rag-Request-Id": requestId,
  };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const phases: PhaseDurations = {};
  const authPromise = measurePhase(phases, "auth", () =>
    getAuthenticatedUser(request),
  );
  const bodyPromise = measurePhase(phases, "body", () =>
    request.json().catch(() => null),
  );
  const settingPromise = measurePhase(
    phases,
    "setting",
    loadCustomKnowledgeEnabledCached,
  )
    .then((enabled) => ({ enabled, error: null }))
    .catch((error: unknown) => ({ enabled: false, error }));
  const [authContext, body, setting] = await Promise.all([
    authPromise,
    bodyPromise,
    settingPromise,
  ]);

  if (!authContext?.user) {
    const totalMs = Math.round(performance.now() - startedAt);
    return Response.json(
      { message: "Unauthorized" },
      {
        headers: createTimingHeaders({ phases, requestId, totalMs }),
        status: 401,
      },
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const rateLimit = await measurePhase(phases, "rateLimit", () =>
    incrementRateLimit(`rag-search:${authContext.user.id}:${clientKey}`, {
      limit: 60,
      windowMs: 5 * 60 * 1_000,
    }),
  );
  if (!rateLimit.allowed) {
    const totalMs = Math.round(performance.now() - startedAt);
    return Response.json(
      { message: "Too many knowledge searches. Please try again shortly." },
      {
        headers: {
          ...createTimingHeaders({ phases, requestId, totalMs }),
          "Retry-After": Math.max(
            1,
            Math.ceil((rateLimit.resetAt - Date.now()) / 1_000),
          ).toString(),
        },
        status: 429,
      },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const totalMs = Math.round(performance.now() - startedAt);
    return Response.json(
      { message: "A valid knowledge query is required." },
      {
        headers: createTimingHeaders({ phases, requestId, totalMs }),
        status: 400,
      },
    );
  }

  if (setting.error) {
    const totalMs = Math.round(performance.now() - startedAt);
    console.error("[voice/rag] setting unavailable", {
      requestId,
      phases,
      totalMs,
      error:
        setting.error instanceof Error
          ? setting.error.message
          : String(setting.error),
    });
    return Response.json(
      { message: "Knowledge search is temporarily unavailable." },
      {
        headers: createTimingHeaders({ phases, requestId, totalMs }),
        status: 503,
      },
    );
  }

  if (!setting.enabled) {
    const totalMs = Math.round(performance.now() - startedAt);
    return Response.json(
      {
        found: false,
        context: "",
        sources: [],
        timing: { requestId, retrievalMs: 0, serverTotalMs: totalMs },
      },
      {
        headers: createTimingHeaders({ phases, requestId, totalMs }),
      },
    );
  }

  const result = await measurePhase(phases, "retrieval", () =>
    retrieveRagContext({
      query: parsed.data.query,
      scope: parsed.data.scope,
      userId: authContext.user.id,
      modelKey: "gemini-live",
      signal: request.signal,
      diagnostics: {
        authSource: authContext.source,
        phaseDurationsMs: Object.fromEntries(
          Object.entries(phases).filter((entry) => entry[0] !== "retrieval"),
        ),
        requestId,
        surface: "live_voice",
      },
      deferLogWrites: (task) => after(task),
    }),
  );
  const totalMs = Math.round(performance.now() - startedAt);
  console.info("[voice/rag] server timing", {
    requestId,
    authSource: authContext.source,
    phases,
    retrievalStatus: result.status,
    selectedCount: result.matches.length,
    totalMs,
  });

  return Response.json(
    {
      found: result.status === "hit",
      context: result.context,
      sources: result.matches.map((match) => ({
        title: match.title,
        sourceUrl: match.sourceUrl,
      })),
      timing: {
        requestId,
        retrievalMs: result.durationMs,
        serverTotalMs: totalMs,
      },
    },
    { headers: createTimingHeaders({ phases, requestId, totalMs }) },
  );
}
