import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  db,
  deleteAppSetting,
  getAppSetting,
  setAppSetting,
} from "@/lib/db/queries";
import { translationKey, translationValue } from "@/lib/db/schema";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";
import { withTimeout } from "@/lib/utils/async";

import {
  getAllLanguages,
  type LanguageOption,
  resolveLanguage,
} from "./languages";

export type TranslationDefinition = {
  key: string;
  defaultText: string;
  description?: string;
};

const LANGUAGE_FALLBACK_DICTIONARIES: Record<string, Record<string, string>> = {
  kha: {
    "recharge.dialog.title": "Peit bniah ïa ka jingrecharge",
    "recharge.dialog.description":
      "Pynshisha ïa ki bynta jong ka plan bad pyndap ïa ka coupon shwa ban bteng sha ka jingsiew.",
    "recharge.dialog.plan_placeholder": "Ka plan kaba phi la jied",
    "recharge.plan.validity": "Ka jingtreikam: {days} sngi",
    "recharge.dialog.summary.discount": "Ka jingduna na ka coupon",
    "recharge.dialog.summary.total": "Ka bai baroh",
    "recharge.dialog.coupon_label": "Code jong ka coupon",
    "recharge.dialog.coupon_helper":
      "Ka coupon kam dei kaba hap ban pyndonkam. Iehtylli lada phim don.",
    "recharge.dialog.coupon_required": "Tiep ïa u code coupon ban pynshisha.",
    "recharge.dialog.coupon_invalid": "Ka coupon ka bakla ne la kut por.",
    "recharge.dialog.coupon_applied": "La pyndonkam ïa ka coupon katba dei.",
    "recharge.dialog.validate": "Pynshisha ïa ka coupon",
    "recharge.dialog.validating": "Dang pynshisha...",
    "recharge.dialog.proceed": "Bteng sha ka jingsiew",
  },
};

const FALLBACK_LANGUAGE: LanguageOption = {
  id: "fallback-en",
  code: "en",
  name: "English",
  isDefault: true,
  isActive: true,
};

const FALLBACK_LANGUAGES: LanguageOption[] = [
  FALLBACK_LANGUAGE,
  {
    id: "fallback-kha",
    code: "kha",
    name: "Khasi",
    isDefault: false,
    isActive: true,
  },
];

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
  process.env.TRANSLATION_QUERY_TIMEOUT_MS ?? "1200",
  10
);
const TRANSLATION_QUERY_TIMEOUT_MS =
  Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 1200;

const parsedInitialTimeout = Number.parseInt(
  process.env.TRANSLATION_INITIAL_TIMEOUT_MS ?? "1500",
  10
);
const TRANSLATION_INITIAL_TIMEOUT_MS =
  Number.isFinite(parsedInitialTimeout) && parsedInitialTimeout > 0
    ? parsedInitialTimeout
    : 1500;

const parsedCacheTtl = Number.parseInt(
  process.env.TRANSLATION_CACHE_TTL_MS ?? `${1000 * 60 * 60 * 6}`,
  10
);
const TRANSLATION_CACHE_TTL_MS =
  Number.isFinite(parsedCacheTtl) && parsedCacheTtl > 0
    ? parsedCacheTtl
    : 1000 * 60 * 60 * 6;

const TRANSLATION_CACHE_PREFIX = "translation_bundle:";

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

    await invalidateTranslationBundleCache();
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

  const languageFallback =
    LANGUAGE_FALLBACK_DICTIONARIES[activeLanguage.code] ?? {};

  return {
    languages,
    activeLanguage,
    dictionary: mergeWithStaticDictionary({
      ...languageFallback,
      ...dictionary,
    }),
  };
}

type TranslationBundle = {
  languages: LanguageOption[];
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
};

type CachedBundle = {
  data: TranslationBundle;
  inflight?: Promise<void>;
};

type PersistedBundle = TranslationBundle & {
  cachedAt: string;
};

const BUNDLE_CACHE = new Map<string, CachedBundle>();

const buildFallbackBundle = (
  preferredCode?: string | null
): TranslationBundle => {
  const activeLanguage =
    FALLBACK_LANGUAGES.find((entry) => entry.code === preferredCode) ??
    FALLBACK_LANGUAGE;
  const languageFallback =
    LANGUAGE_FALLBACK_DICTIONARIES[activeLanguage.code] ?? {};

  return {
    languages: [...FALLBACK_LANGUAGES],
    activeLanguage,
    dictionary: mergeWithStaticDictionary(languageFallback),
  };
};

const FALLBACK_BUNDLE: TranslationBundle = buildFallbackBundle();

const skipTranslationCache =
  typeof process !== "undefined" && process.env.SKIP_TRANSLATION_CACHE === "1";

async function persistBundle(key: string, bundle: TranslationBundle) {
  await setAppSetting({
    key: `${TRANSLATION_CACHE_PREFIX}${key}`,
    value: {
      ...bundle,
      cachedAt: new Date().toISOString(),
    } satisfies PersistedBundle,
  });
}

async function readPersistedBundle(
  key: string
): Promise<PersistedBundle | null> {
  const stored = await getAppSetting<PersistedBundle>(
    `${TRANSLATION_CACHE_PREFIX}${key}`
  );

  if (!stored) {
    return null;
  }

  if (!("cachedAt" in stored)) {
    return null;
  }

  return stored;
}

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
    .then(async (bundle) => {
      BUNDLE_CACHE.set(key, { data: bundle });
      await persistBundle(key, bundle).catch((error) => {
        console.error("[i18n] Failed to persist translation bundle.", error);
      });
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
    data: existing?.data ?? buildFallbackBundle(preferredCode),
    inflight: inflight.then(() => {
      return;
    }),
  });
}

export async function getTranslationBundle(
  preferredCode?: string | null
): Promise<TranslationBundle> {
  const key = cacheKeyForLanguage(preferredCode);
  const cached = BUNDLE_CACHE.get(key);
  if (cached) {
    if (!cached.inflight) {
      const persisted = await readPersistedBundle(key);
      if (!persisted) {
        scheduleBundleRefresh(key, preferredCode);
      } else if (
        Date.now() - new Date(persisted.cachedAt).getTime() >
        TRANSLATION_CACHE_TTL_MS
      ) {
        scheduleBundleRefresh(key, preferredCode);
      }
    }
    return cached.data;
  }

  const persisted = await readPersistedBundle(key);
  if (persisted) {
    const { cachedAt, ...bundle } = persisted;
    BUNDLE_CACHE.set(key, { data: bundle });
    if (Date.now() - new Date(cachedAt).getTime() > TRANSLATION_CACHE_TTL_MS) {
      scheduleBundleRefresh(key, preferredCode);
    }
    return bundle;
  }

  try {
    const bundle = await withTimeout(
      loadTranslationBundle(preferredCode),
      TRANSLATION_INITIAL_TIMEOUT_MS,
      () => {
        console.warn(
          `[i18n] Initial bundle load timed out after ${TRANSLATION_INITIAL_TIMEOUT_MS}ms for key "${key}".`
        );
      }
    );
    BUNDLE_CACHE.set(key, { data: bundle });
    await persistBundle(key, bundle).catch((error) => {
      console.error("[i18n] Failed to persist translation bundle.", error);
    });
    return bundle;
  } catch (error) {
    console.error("[i18n] Falling back to static translations.", error);
    const fallbackBundle = buildFallbackBundle(preferredCode);
    BUNDLE_CACHE.set(key, { data: fallbackBundle });
    scheduleBundleRefresh(key, preferredCode);
    return fallbackBundle;
  }
}

export async function invalidateTranslationBundleCache(
  languageCodes?: string[]
) {
  const targetSet = new Set<string>();

  if (languageCodes && languageCodes.length > 0) {
    for (const code of languageCodes) {
      targetSet.add(cacheKeyForLanguage(code));
    }
  } else {
    for (const key of BUNDLE_CACHE.keys()) {
      targetSet.add(key);
    }
  }

  targetSet.add("__default");

  const targets = Array.from(targetSet);

  for (const key of targets) {
    BUNDLE_CACHE.delete(key);
  }

  await Promise.all(
    targets.map((key) =>
      deleteAppSetting(`${TRANSLATION_CACHE_PREFIX}${key}`).catch((error) => {
        console.error(
          `[i18n] Failed to delete persisted translation bundle for key "${key}".`,
          error
        );
      })
    )
  );
}

export async function publishAllTranslations() {
  await registerTranslationKeys(STATIC_TRANSLATION_DEFINITIONS);
  await invalidateTranslationBundleCache();

  const languages = await getAllLanguages();
  const activeCodes = languages
    .filter((language) => language.isActive)
    .map((language) => language.code);

  const previous = process.env.SKIP_TRANSLATION_CACHE;
  if (!skipTranslationCache) {
    process.env.SKIP_TRANSLATION_CACHE = "1";
  }

  try {
    await Promise.all([
      getTranslationBundle(undefined),
      ...activeCodes.map((code) => getTranslationBundle(code)),
    ]);
  } finally {
    if (!skipTranslationCache) {
      if (typeof previous === "string") {
        process.env.SKIP_TRANSLATION_CACHE = previous;
      } else {
        process.env.SKIP_TRANSLATION_CACHE = undefined;
      }
    }
  }
}

export async function getTranslationForKey(
  preferredCode: string | null | undefined,
  definition: TranslationDefinition
) {
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
    console.error(
      "[i18n] Falling back to default texts for bulk translations.",
      error
    );
    return definitions.reduce<Record<string, string>>(
      (accumulator, definition) => {
        accumulator[definition.key] = definition.defaultText;
        return accumulator;
      },
      {}
    );
  }
}
