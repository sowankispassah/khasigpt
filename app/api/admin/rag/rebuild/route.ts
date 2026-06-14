import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { createAuditLogEntry } from "@/lib/db/queries";
import { rebuildAllRagFileSearchIndexes } from "@/lib/rag/service";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const REBUILD_TIMEOUT_MS = 45_000;
const AUDIT_TIMEOUT_MS = 3_000;

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "timeout";
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  console.info("[api/admin/rag/rebuild] start", {
    actorId: user.id,
    scope: "custom_rag",
  });

  try {
    const summary = await withTimeout(
      rebuildAllRagFileSearchIndexes(),
      REBUILD_TIMEOUT_MS,
      () => {
        console.warn("[api/admin/rag/rebuild] timeout", {
          actorId: user.id,
          timeoutMs: REBUILD_TIMEOUT_MS,
        });
      }
    );

    invalidateAdminMutation({
      paths: [{ path: "/admin/rag" }],
      source: "rag.file_search.rebuild",
    });

    void withTimeout(
      createAuditLogEntry({
        actorId: user.id,
        action: "rag.file_search.rebuild",
        target: { feature: "rag.file_search", scope: "custom_rag" },
        metadata: summary,
      }),
      AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error("[api/admin/rag/rebuild] audit_failed", error);
    });

    console.info("[api/admin/rag/rebuild] end", {
      actorId: user.id,
      summary,
    });

    return NextResponse.json(
      { ok: true, summary },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/admin/rag/rebuild] failed", {
      actorId: user.id,
      error,
    });
    return NextResponse.json(
      {
        error: isTimeoutError(error) ? "timeout" : "rebuild_failed",
        message: isTimeoutError(error)
          ? "RAG rebuild timed out. Some entries may still be marked failed; try again later."
          : "Unable to rebuild the RAG File Search index.",
      },
      { status: isTimeoutError(error) ? 504 : 500 }
    );
  }
}
