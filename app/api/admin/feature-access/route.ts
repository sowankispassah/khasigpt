import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createAuditLogEntry,
  setAppSetting,
} from "@/lib/db/queries";
import { type FeatureAccessMode, parseFeatureAccessMode } from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";

type FeatureAccessFieldConfig = {
  auditAction: string;
  fallbackMode: FeatureAccessMode;
  settingKey: string;
};

const FEATURE_ACCESS_TIMEOUT_MS = 10_000;
const FEATURE_ACCESS_AUDIT_TIMEOUT_MS = 3_000;

const FEATURE_ACCESS_FIELD_CONFIG: Record<string, FeatureAccessFieldConfig> = {
  forumAccessMode: {
    settingKey: FORUM_FEATURE_FLAG_KEY,
    fallbackMode: "enabled",
    auditAction: "forum.toggle",
  },
  calculatorAccessMode: {
    settingKey: CALCULATOR_FEATURE_FLAG_KEY,
    fallbackMode: "enabled",
    auditAction: "feature.calculator.toggle",
  },
  studyModeAccessMode: {
    settingKey: STUDY_MODE_FEATURE_FLAG_KEY,
    fallbackMode: "disabled",
    auditAction: "feature.study_mode.toggle",
  },
  jobsAccessMode: {
    settingKey: JOBS_FEATURE_FLAG_KEY,
    fallbackMode: "disabled",
    auditAction: "feature.jobs_mode.toggle",
  },
  imageGenerationAccessMode: {
    settingKey: IMAGE_GENERATION_FEATURE_FLAG_KEY,
    fallbackMode: "disabled",
    auditAction: "feature.image_generation.toggle",
  },
  documentUploadsAccessMode: {
    settingKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
    fallbackMode: "disabled",
    auditAction: "feature.document_uploads.toggle",
  },
  suggestedPromptsAccessMode: {
    settingKey: SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
    fallbackMode: "enabled",
    auditAction: "feature.suggested_prompts.toggle",
  },
  iconPromptsAccessMode: {
    settingKey: ICON_PROMPTS_ENABLED_SETTING_KEY,
    fallbackMode: "disabled",
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

export async function POST(request: Request) {
  const session = await withTimeout(auth(), FEATURE_ACCESS_TIMEOUT_MS).catch(
    () => null
  );
  if (!session?.user || session.user.role !== "admin") {
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

  const resolvedMode = parseFeatureAccessMode(mode, config.fallbackMode);

  try {
    await withTimeout(
      setAppSetting({
        key: config.settingKey,
        value: resolvedMode,
      }),
      FEATURE_ACCESS_TIMEOUT_MS
    );
  } catch (error) {
    const status = isTimeoutError(error) ? 504 : 500;
    const responseCode = isTimeoutError(error) ? "timeout" : "save_failed";

    console.error(
      `[api/admin/feature-access] Failed to save setting "${config.settingKey}".`,
      error
    );

    return NextResponse.json({ error: responseCode }, { status });
  }

  revalidateTag(appSettingCacheTagForKey(config.settingKey));

  void withTimeout(
    createAuditLogEntry({
      actorId: session.user.id,
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
