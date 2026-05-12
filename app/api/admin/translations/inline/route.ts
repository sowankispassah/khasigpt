import { after, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api/auth";
import {
  createAuditLogEntry,
  deleteTranslationValueEntry,
  getTranslationKeyByKey,
  upsertTranslationValueEntry,
} from "@/lib/db/queries";
import {
  patchTranslationBundleCacheEntry,
  registerTranslationKeys,
} from "@/lib/i18n/dictionary";
import { getLanguageByCode } from "@/lib/i18n/languages";
import { withTimeout } from "@/lib/utils/async";

const INLINE_TRANSLATION_AUDIT_TIMEOUT_MS = 2500;
const INLINE_TRANSLATION_CACHE_PATCH_TIMEOUT_MS = 2500;
const INLINE_TRANSLATION_WRITE_TIMEOUT_MS = 10000;

type InlineTranslationBody = {
  defaultText?: unknown;
  description?: unknown;
  key?: unknown;
  languageCode?: unknown;
  source?: unknown;
  value?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function normalizeRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRequestMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;
  return {
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  };
}

async function auditInlineTranslationWrite(
  args: Parameters<typeof createAuditLogEntry>[0]
) {
  await withTimeout(
    createAuditLogEntry(args),
    INLINE_TRANSLATION_AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[admin/translations/inline] Audit write failed or timed out.",
      error
    );
  });
}

function scheduleInlineTranslationSideEffects({
  audit,
}: {
  audit: Parameters<typeof createAuditLogEntry>[0];
}) {
  after(() => {
    void auditInlineTranslationWrite(audit);
  });
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  const authContext = await requireAdminUser(request);
  if (!authContext) {
    return jsonError("Forbidden", 403);
  }

  let body: InlineTranslationBody;
  try {
    body = (await request.json()) as InlineTranslationBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const key = normalizeRequiredString(body.key);
  const languageCode = normalizeRequiredString(body.languageCode).toLowerCase();
  const defaultText = normalizeRequiredString(body.defaultText);
  const description = normalizeRequiredString(body.description) || null;
  const source = body.source === "native" ? "native" : "web";
  const normalizedValue =
    typeof body.value === "string" ? body.value.trim() : "";

  if (!key) {
    return jsonError("Missing translation key", 400);
  }
  if (!languageCode) {
    return jsonError("Missing language code", 400);
  }
  if (!defaultText) {
    return jsonError("Missing English source text", 400);
  }

  const language = await withTimeout(
    getLanguageByCode(languageCode),
    INLINE_TRANSLATION_WRITE_TIMEOUT_MS
  );
  if (!language?.isActive) {
    return jsonError("Language is not active", 400);
  }

  await withTimeout(
    registerTranslationKeys(
      [
        {
          key,
          defaultText,
          description:
            description ??
            `Inline editable UI copy registered from ${source}.`,
        },
      ],
      { invalidateCache: false }
    ),
    INLINE_TRANSLATION_WRITE_TIMEOUT_MS
  );

  const translationKey = await withTimeout(
    getTranslationKeyByKey(key),
    INLINE_TRANSLATION_WRITE_TIMEOUT_MS
  );
  if (!translationKey) {
    return jsonError("Translation key could not be registered", 500);
  }

  if (normalizedValue) {
    await withTimeout(
      upsertTranslationValueEntry({
        translationKeyId: translationKey.id,
        languageId: language.id,
        value: normalizedValue,
      }),
      INLINE_TRANSLATION_WRITE_TIMEOUT_MS
    );
  } else {
    await withTimeout(
      deleteTranslationValueEntry({
        translationKeyId: translationKey.id,
        languageId: language.id,
      }),
      INLINE_TRANSLATION_WRITE_TIMEOUT_MS
    );
  }

  const responseText = normalizedValue || translationKey.defaultText;
  const cachePatched = await withTimeout(
    patchTranslationBundleCacheEntry({
      defaultText: translationKey.defaultText,
      key,
      languageCode: language.code,
      text: responseText,
    }),
    INLINE_TRANSLATION_CACHE_PATCH_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[admin/translations/inline] Cache patch failed or timed out.",
      {
        error,
        key,
        languageCode: language.code,
      }
    );
    return false;
  });

  const { ipAddress, userAgent } = getRequestMetadata(request);
  scheduleInlineTranslationSideEffects({
    audit: {
      actorId: authContext.user.id,
      action: "translation.inline.save",
      ipAddress,
      target: {
        languageCode: language.code,
        translationKey: key,
        translationKeyId: translationKey.id,
      },
      userAgent,
      metadata: {
        cleared: normalizedValue.length === 0,
        defaultTextSnippet: defaultText.slice(0, 160),
        durationMs: Date.now() - startedAt,
        source,
        valueSnippet: normalizedValue.slice(0, 160),
      },
    },
  });

  console.info("[admin/translations/inline] saved", {
    cachePatched,
    cleared: normalizedValue.length === 0,
    durationMs: Date.now() - startedAt,
    key,
    languageCode: language.code,
    source,
  });

  return NextResponse.json(
    {
      defaultText: translationKey.defaultText,
      key,
      languageCode: language.code,
      ok: true,
      text: responseText,
      value: normalizedValue,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
