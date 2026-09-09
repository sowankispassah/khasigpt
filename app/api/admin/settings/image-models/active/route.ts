import { type NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SETTINGS_IMAGE_MODELS_CACHE_TAG,
  invalidateAdminMutation,
} from "@/lib/admin/cache-invalidation";
import { IMAGE_MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/image-model-registry";
import { createLiteAuditLogEntry } from "@/lib/db/app-settings-lite";
import {
  getAdminActiveImageModelConfigId,
  setActiveImageModelConfig,
} from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MODEL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIT_TIMEOUT_MS = 3000;

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  try {
    const activeImageModelId = await getAdminActiveImageModelConfigId();
    return noStoreJson({ activeImageModelId, ok: true });
  } catch (error) {
    console.error("[api/admin/settings/image-models/active] read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return noStoreJson({ error: "read_failed" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  const body = await request.json().catch(() => null);
  const imageModelId =
    body && typeof body === "object" && "imageModelId" in body
      ? (body as { imageModelId?: unknown }).imageModelId
      : null;

  if (
    typeof imageModelId !== "string" ||
    !IMAGE_MODEL_ID_PATTERN.test(imageModelId)
  ) {
    return noStoreJson({ error: "invalid_image_model_id" }, 400);
  }

  const startedAt = Date.now();
  console.info("[api/admin/settings/image-models/active] save:start", {
    actorId: user.id,
    imageModelId,
  });

  try {
    const activeImageModelId = await setActiveImageModelConfig(imageModelId);
    invalidateAdminMutation({
      source: "image_model.setActive.api",
      tags: [
        IMAGE_MODEL_REGISTRY_CACHE_TAG,
        ADMIN_SETTINGS_IMAGE_MODELS_CACHE_TAG,
      ],
    });

    void withTimeout(
      createLiteAuditLogEntry({
        actorId: user.id,
        action: "image_model.setActive",
        target: { imageModelId },
      }),
      AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        "[api/admin/settings/image-models/active] audit failed",
        error
      );
    });

    console.info("[api/admin/settings/image-models/active] save:end", {
      activeImageModelId,
      durationMs: Date.now() - startedAt,
    });
    return noStoreJson({ activeImageModelId, ok: true });
  } catch (error) {
    console.error("[api/admin/settings/image-models/active] save failed", {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      imageModelId,
    });
    return noStoreJson({ error: "save_failed" }, 500);
  }
}
