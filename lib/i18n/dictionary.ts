import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import {
  translationKey,
  translationValue,
} from "@/lib/db/schema";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";
import { withTimeout } from "@/lib/utils/async";

import { resolveLanguage, type LanguageOption } from "./languages";

export type TranslationDefinition = {
  key: string;
  defaultText: string;
  description?: string;
};

const FALLBACK_LANGUAGE: LanguageOption = {
  id: "fallback-en",
  code: "en",
  name: "English",
  isDefault: true,
  isActive: true,
};

const STATIC_DICTIONARY_BASE = Object.freeze(
  STATIC_TRANSLATION_DEFINITIONS.reduce<Record<string, string>>(
    (accumulator, definition) => {
      accumulator[definition.key] = definition.defaultText;
      return accumulator;
    },
    {}
  )
);

const mergeWithStaticDictionary = (dictionary: Record<string, string>) => {
  return { ...STATIC_DICTIONARY_BASE, ...dictionary };
};

const parsedTimeout = Number.parseInt(
  process.env.TRANSLATION_QUERY_TIMEOUT_MS ?? "2000",
  10
);
const TRANSLATION_QUERY_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 2000;

export async function registerTranslationKeys(
  definitions: TranslationDefinition[]
) {
  if (!definitions.length) {
    return;
  }

  try {
    const keys = definitions.map((definition) => definition.key);

    const existing = await db
      .select({
        key: translationKey.key,
        defaultText: translationKey.defaultText,
        description: translationKey.description,
      })
      .from(translationKey)
      .where(inArray(translationKey.key, keys));

    const existingMap = new Map(
      existing.map((entry) => [
        entry.key,
        {
          defaultText: entry.defaultText,
          description: entry.description ?? null,
        },
      ])
    );

    const definitionsToSync = definitions.filter((definition) => {
      const current = existingMap.get(definition.key);
      const description = definition.description ?? null;

      if (!current) {
        return true;
      }

      return (
        current.defaultText !== definition.defaultText ||
        current.description !== description
      );
    });

    if (!definitionsToSync.length) {
      return;
    }

    await db
      .insert(translationKey)
      .values(
        definitionsToSync.map(({ key, defaultText, description }) => ({
          key,
          defaultText,
          description: description ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: translationKey.key,
        set: {
          defaultText: sql`excluded."defaultText"`,
          description: sql`excluded."description"`,
          updatedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.error("[i18n] Failed to register translation keys.", error);
  }
}

async function loadTranslationBundle(preferredCode?: string | null) {
  const { activeLanguage, languages } = await resolveLanguage(preferredCode);

  const rows = await db
    .select({
      key: translationKey.key,
      defaultText: translationKey.defaultText,
      value: translationValue.value,
    })
    .from(translationKey)
    .leftJoin(
      translationValue,
      and(
        eq(translationValue.translationKeyId, translationKey.id),
        eq(translationValue.languageId, activeLanguage.id)
      )
    )
    .orderBy(asc(translationKey.key));

  const dictionary: Record<string, string> = {};
  for (const row of rows) {
    dictionary[row.key] = row.value ?? row.defaultText;
  }

  return {
    languages,
    activeLanguage,
    dictionary: mergeWithStaticDictionary(dictionary),
  };
}

type TranslationBundle = {
  languages: LanguageOption[];
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
};

const BUNDLE_CACHE = new Map<
  string,
  {
    data: TranslationBundle;
    inflight?: Promise<void>;
  }
>();

const FALLBACK_BUNDLE: TranslationBundle = {
  languages: [FALLBACK_LANGUAGE],
  activeLanguage: FALLBACK_LANGUAGE,
  dictionary: mergeWithStaticDictionary({}),
};

function cacheKeyForLanguage(code?: string | null) {
  const normalized = code?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "__default";
}

function scheduleBundleRefresh(key: string, preferredCode?: string | null) {
  const existing = BUNDLE_CACHE.get(key);
  if (existing?.inflight) {
    return;
  }

  const inflight = withTimeout(
    loadTranslationBundle(preferredCode),
    TRANSLATION_QUERY_TIMEOUT_MS,
    () => {
      console.warn(
        `[i18n] Bundle refresh timed out after ${TRANSLATION_QUERY_TIMEOUT_MS}ms for key "${key}".`
      );
    }
  )
    .then((bundle) => {
      BUNDLE_CACHE.set(key, { data: bundle });
    })
    .catch((error) => {
      console.error("[i18n] Falling back to static translations.", error);
    })
    .finally(() => {
      const current = BUNDLE_CACHE.get(key);
      if (current) {
        current.inflight = undefined;
      }
    });

  BUNDLE_CACHE.set(key, {
    data: existing?.data ?? FALLBACK_BUNDLE,
    inflight: inflight.then(() => {}),
  });
}

export async function getTranslationBundle(
  preferredCode?: string | null
): Promise<TranslationBundle> {
  const key = cacheKeyForLanguage(preferredCode);
  const cached = BUNDLE_CACHE.get(key);
  if (cached) {
    scheduleBundleRefresh(key, preferredCode);
    return cached.data;
  }

  BUNDLE_CACHE.set(key, { data: FALLBACK_BUNDLE });
  scheduleBundleRefresh(key, preferredCode);
  return FALLBACK_BUNDLE;
}

export async function getTranslationForKey(
  preferredCode: string | null | undefined,
  definition: TranslationDefinition
) {
  void registerTranslationKeys([definition]);

  try {
    const { activeLanguage } = await withTimeout(
      resolveLanguage(preferredCode),
      TRANSLATION_QUERY_TIMEOUT_MS
    );

    const [result] = await withTimeout(
      db
        .select({
          value: translationValue.value,
          defaultText: translationKey.defaultText,
        })
        .from(translationKey)
        .leftJoin(
          translationValue,
          and(
            eq(translationValue.translationKeyId, translationKey.id),
            eq(translationValue.languageId, activeLanguage.id)
          )
        )
        .where(eq(translationKey.key, definition.key))
        .limit(1),
      TRANSLATION_QUERY_TIMEOUT_MS
    );

    return result?.value ?? result?.defaultText ?? definition.defaultText;
  } catch (error) {
    console.error(
      `[i18n] Falling back to default text for translation key "${definition.key}".`,
      error
    );
    return definition.defaultText;
  }
}

export async function getTranslationsForKeys(
  preferredCode: string | null | undefined,
  definitions: TranslationDefinition[]
) {
  if (!definitions.length) {
    return {};
  }

  void registerTranslationKeys(definitions);

  try {
    const { activeLanguage } = await withTimeout(
      resolveLanguage(preferredCode),
      TRANSLATION_QUERY_TIMEOUT_MS
    );
    const keys = definitions.map((definition) => definition.key);

    const rows = await withTimeout(
      db
        .select({
          key: translationKey.key,
          defaultText: translationKey.defaultText,
          value: translationValue.value,
        })
        .from(translationKey)
        .leftJoin(
          translationValue,
          and(
            eq(translationValue.translationKeyId, translationKey.id),
            eq(translationValue.languageId, activeLanguage.id)
          )
        )
        .where(inArray(translationKey.key, keys)),
      TRANSLATION_QUERY_TIMEOUT_MS
    );

    const result: Record<string, string> = {};
    for (const definition of definitions) {
      const row = rows.find((entry) => entry.key === definition.key);
      result[definition.key] =
        row?.value ?? row?.defaultText ?? definition.defaultText;
    }

    return result;
  } catch (error) {
    console.error("[i18n] Falling back to default texts for bulk translations.", error);
    return definitions.reduce<Record<string, string>>((accumulator, definition) => {
      accumulator[definition.key] = definition.defaultText;
      return accumulator;
    }, {});
  }
}
