import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { createAuditLogEntry } from "@/lib/db/queries";
import { rebuildAllRagIndexes } from "@/lib/rag/service";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const AUDIT_TIMEOUT_MS = 3_000;

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
    const summary = await rebuildAllRagIndexes();

    invalidateAdminMutation({
      paths: [{ path: "/admin/rag" }],
      source: "rag.index.rebuild",
    });

    void withTimeout(
      createAuditLogEntry({
        actorId: user.id,
        action: "rag.index.rebuild",
        target: { feature: "rag.index", scope: "custom_rag" },
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
        error: "rebuild_failed",
        message: "Unable to rebuild the knowledge index.",
      },
      { status: 500 }
    );
  }
}
