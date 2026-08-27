import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createLiteAuditLogEntry,
  getLiteAppSettingUncached,
  setLiteAppSetting,
} from "@/lib/db/app-settings-lite";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const RAG_SETTING_READ_TIMEOUT_MS = 8_000;
const RAG_SETTING_WRITE_TIMEOUT_MS = 10_000;
const RAG_SETTING_AUDIT_TIMEOUT_MS = 3_000;
const AUDIT_ACTION = "settings.custom_knowledge.update";

function parseBooleanInput(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "timeout";
}

async function loadCustomKnowledgeEnabled() {
  const value = await withTimeout(
    getLiteAppSettingUncached(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    RAG_SETTING_READ_TIMEOUT_MS
  );
  return parseBooleanSetting(value, false);
}

export async function GET(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const enabled = await loadCustomKnowledgeEnabled();
    return NextResponse.json(
      { enabled },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/admin/rag/settings] Failed to load setting.", error);
    return NextResponse.json(
      {
        error: isTimeoutError(error) ? "timeout" : "load_failed",
        message: isTimeoutError(error)
          ? "RAG setting load timed out. Please try again."
          : "Failed to load RAG setting.",
      },
      { status: isTimeoutError(error) ? 504 : 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const enabled = parseBooleanInput(
    body && typeof body === "object" && "enabled" in body
      ? (body as { enabled?: unknown }).enabled
      : null
  );
  if (enabled === null) {
    return NextResponse.json(
      { error: "invalid_value", message: "Invalid RAG setting value." },
      { status: 400 }
    );
  }

  let previousValue: boolean | null = null;
  try {
    previousValue = await loadCustomKnowledgeEnabled();
    console.info("[api/admin/rag/settings] save:start", {
      actorId: user.id,
      enabled,
      previousValue,
      settingKey: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
      source: AUDIT_ACTION,
    });

    await withTimeout(
      setLiteAppSetting({
        key: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
        value: enabled,
      }),
      RAG_SETTING_WRITE_TIMEOUT_MS
    );

    const persistedValue = await loadCustomKnowledgeEnabled();
    if (persistedValue !== enabled) {
      console.error("[api/admin/rag/settings] Readback mismatch.", {
        expected: enabled,
        persisted: persistedValue,
        previousValue,
        settingKey: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
      });
      return NextResponse.json(
        {
          error: "readback_mismatch",
          message: "RAG setting save could not be confirmed.",
        },
        { status: 500 }
      );
    }

    invalidateAdminMutation({
      source: AUDIT_ACTION,
      tags: [appSettingCacheTagForKey(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY)],
    });

    void withTimeout(
      createLiteAuditLogEntry({
        actorId: user.id,
        action: AUDIT_ACTION,
        target: { setting: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY },
        metadata: { enabled, previousValue },
      }),
      RAG_SETTING_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error("[api/admin/rag/settings] Audit log write failed.", error);
      return null;
    });

    console.info("[api/admin/rag/settings] save:end", {
      enabled: persistedValue,
      settingKey: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
      source: AUDIT_ACTION,
    });

    return NextResponse.json(
      { ok: true, enabled: persistedValue },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[api/admin/rag/settings] Failed to save setting.", {
      enabled,
      error,
      previousValue,
      settingKey: CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
    });
    return NextResponse.json(
      {
        error: isTimeoutError(error) ? "timeout" : "save_failed",
        message: isTimeoutError(error)
          ? "RAG setting save timed out. Please try again."
          : "Failed to save RAG setting.",
      },
      { status: isTimeoutError(error) ? 504 : 500 }
    );
  }
}
