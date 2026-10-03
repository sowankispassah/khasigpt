import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api/auth";
import {
  createAuditLogEntry,
  getAppSetting,
  setAppSetting,
} from "@/lib/db/queries";
import { getLanguageByCode } from "@/lib/i18n/languages";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUDIT_TIMEOUT_MS = 2500;

type ResourceKey = "about" | "privacyPolicy" | "termsOfService";

type InlineResourceBody = {
  content?: unknown;
  languageCode?: unknown;
  resource?: unknown;
  source?: unknown;
};

const RESOURCE_CONFIG: Record<
  ResourceKey,
  {
    auditAction: string;
    baseSettingKey: string;
    localizedSettingKey: string;
  }
> = {
  about: {
    auditAction: "company.about.inline.update",
    baseSettingKey: "aboutUsContent",
    localizedSettingKey: "aboutUsContentByLanguage",
  },
  privacyPolicy: {
    auditAction: "legal.privacy.inline.update",
    baseSettingKey: "privacyPolicy",
    localizedSettingKey: "privacyPolicyByLanguage",
  },
  termsOfService: {
    auditAction: "legal.terms.inline.update",
    baseSettingKey: "termsOfService",
    localizedSettingKey: "termsOfServiceByLanguage",
  },
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeResource(value: unknown): ResourceKey | null {
  if (value === "about" || value === "privacyPolicy" || value === "termsOfService") {
    return value;
  }
  return null;
}

function normalizeLocalizedContent(value: unknown) {
  const normalized: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const [code, content] of Object.entries(value)) {
    if (typeof content === "string" && content.trim().length > 0) {
      normalized[code] = content.trim();
    }
  }

  return normalized;
}

function getRequestMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent"),
  };
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  const authContext = await requireAdminUser(request);
  if (!authContext) {
    return jsonError("Forbidden", 403);
  }

  let body: InlineResourceBody;
  try {
    body = (await request.json()) as InlineResourceBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const resource = normalizeResource(body.resource);
  const languageCode = normalizeString(body.languageCode).toLowerCase();
  const content = normalizeString(body.content);
  const source = body.source === "native" ? "native" : "web";

  if (!resource) {
    return jsonError("Invalid resource", 400);
  }
  if (!languageCode) {
    return jsonError("Missing language code", 400);
  }
  if (!content) {
    return jsonError("Content cannot be empty", 400);
  }

  const language = await getLanguageByCode(languageCode);
  if (!language?.isActive) {
    return jsonError("Language is not active", 400);
  }

  const config = RESOURCE_CONFIG[resource];
  const localized = normalizeLocalizedContent(
    await getAppSetting<unknown>(config.localizedSettingKey)
  );
  localized[language.code] = content;

  await setAppSetting({
    key: config.localizedSettingKey,
    value: localized,
  });

  if (language.isDefault) {
    await setAppSetting({
      key: config.baseSettingKey,
      value: content,
    });
  }

  const { ipAddress, userAgent } = getRequestMetadata(request);
  await withTimeout(
    createAuditLogEntry({
      actorId: authContext.user.id,
      action: config.auditAction,
      ipAddress,
      target: {
        languageCode: language.code,
        resource,
        setting: config.localizedSettingKey,
      },
      userAgent,
      metadata: {
        contentSnippet: content.slice(0, 200),
        durationMs: Date.now() - startedAt,
        source,
      },
    }),
    AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error("[admin/resources/inline] Audit write failed or timed out.", error);
  });

  console.info("[admin/resources/inline] saved", {
    durationMs: Date.now() - startedAt,
    languageCode: language.code,
    resource,
    source,
  });

  return NextResponse.json(
    {
      content,
      languageCode: language.code,
      ok: true,
      resource,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
