import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createLiteAuditLogEntry,
  getLiteAppSettingUncached,
  setLiteAppSetting,
} from "@/lib/db/app-settings-lite";
import {
  type FeatureAccessMode,
  parseFeatureAccessModeStrict,
} from "@/lib/feature-access";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

type FeatureAccessFieldConfig = {
  auditAction: string;
  settingKey: string;
};

const FEATURE_ACCESS_TIMEOUT_MS = 10_000;
const FEATURE_ACCESS_AUDIT_TIMEOUT_MS = 3_000;

const FEATURE_ACCESS_FIELD_CONFIG: Record<string, FeatureAccessFieldConfig> = {
  calculatorAccessMode: {
    settingKey: CALCULATOR_FEATURE_FLAG_KEY,
    auditAction: "feature.calculator.toggle",
  },
  studyModeAccessMode: {
    settingKey: STUDY_MODE_FEATURE_FLAG_KEY,
    auditAction: "feature.study_mode.toggle",
  },
  translateAccessMode: {
    settingKey: TRANSLATE_FEATURE_FLAG_KEY,
    auditAction: "feature.translate.toggle",
  },
  jobsAccessMode: {
    settingKey: JOBS_FEATURE_FLAG_KEY,
    auditAction: "feature.jobs_mode.toggle",
  },
  imageGenerationAccessMode: {
    settingKey: IMAGE_GENERATION_FEATURE_FLAG_KEY,
    auditAction: "feature.image_generation.toggle",
  },
  documentUploadsAccessMode: {
    settingKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
    auditAction: "feature.document_uploads.toggle",
  },
  suggestedPromptsAccessMode: {
    settingKey: SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
    auditAction: "feature.suggested_prompts.toggle",
  },
  iconPromptsAccessMode: {
    settingKey: ICON_PROMPTS_ENABLED_SETTING_KEY,
    auditAction: "feature.icon_prompts.toggle",
  },
};

export const runtime = "nodejs";

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "timeout";
}

function isFeatureAccessMode(value: unknown): value is FeatureAccessMode {
  return value === "enabled" || value === "admin_only" || value === "disabled";
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fieldName =
    body && typeof body === "object" && "fieldName" in body
      ? (body as { fieldName?: unknown }).fieldName
      : null;
  const mode =
    body && typeof body === "object" && "mode" in body
      ? (body as { mode?: unknown }).mode
      : null;

  if (typeof fieldName !== "string" || !fieldName.trim()) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 });
  }

  if (!isFeatureAccessMode(mode)) {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }

  const config = FEATURE_ACCESS_FIELD_CONFIG[fieldName];
  if (!config) {
    return NextResponse.json({ error: "unknown_field" }, { status: 400 });
  }

  const resolvedMode = mode;

  try {
    await withTimeout(
      setLiteAppSetting({
        key: config.settingKey,
        value: resolvedMode,
      },
      {
        featureSettingWrite: {
          actorId: user.id,
          route: "/api/admin/feature-access",
          source: config.auditAction,
        },
      }),
      FEATURE_ACCESS_TIMEOUT_MS
    );
    const persistedMode = parseFeatureAccessModeStrict(
      await withTimeout(
        getLiteAppSettingUncached(config.settingKey),
        FEATURE_ACCESS_TIMEOUT_MS
      )
    );
    if (persistedMode !== resolvedMode) {
      console.error("[api/admin/feature-access] Readback mismatch.", {
        expected: resolvedMode,
        fieldName,
        persisted: persistedMode,
        settingKey: config.settingKey,
      });
      return NextResponse.json({ error: "readback_mismatch" }, { status: 500 });
    }
  } catch (error) {
    const status = isTimeoutError(error) ? 504 : 500;
    const responseCode = isTimeoutError(error) ? "timeout" : "save_failed";

    console.error(
      `[api/admin/feature-access] Failed to save setting "${config.settingKey}".`,
      error
    );

    return NextResponse.json({ error: responseCode }, { status });
  }

  invalidateAdminMutation({
    source: config.auditAction,
    tags: [appSettingCacheTagForKey(config.settingKey)],
  });
  console.info("[api/admin/feature-access] Scoped feature mutation invalidation.", {
    accessMode: resolvedMode,
    fieldName,
    invalidatedTags: [appSettingCacheTagForKey(config.settingKey)],
    settingKey: config.settingKey,
    source: config.auditAction,
  });

  void withTimeout(
    createLiteAuditLogEntry({
      actorId: user.id,
      action: config.auditAction,
      target: { setting: config.settingKey },
      metadata: { accessMode: resolvedMode },
    }),
    FEATURE_ACCESS_AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      `[api/admin/feature-access] Audit log write failed for "${config.settingKey}".`,
      error
    );
    return null;
  });

  return NextResponse.json(
    { ok: true, mode: resolvedMode },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
