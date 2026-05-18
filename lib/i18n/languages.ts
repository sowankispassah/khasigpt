import { asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/lib/db/queries";
import { language } from "@/lib/db/schema";

export type LanguageOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  syncUiLanguage: boolean;
};

const FALLBACK_LANGUAGE: LanguageOption = {
  id: "fallback-en",
  code: "en",
  name: "English",
  isDefault: true,
  isActive: true,
  syncUiLanguage: true,
};

const FALLBACK_LANGUAGES: LanguageOption[] = [
  FALLBACK_LANGUAGE,
  {
    id: "fallback-kha",
    code: "kha",
    name: "Khasi",
    isDefault: false,
    isActive: true,
    syncUiLanguage: true,
  },
];

const shouldBypassCache =
  typeof process !== "undefined" && process.env.SKIP_TRANSLATION_CACHE === "1";

const isProductionBuildPhase = () =>
  typeof process !== "undefined" &&
  (process.env.APP_BUILD_PHASE === "production-build" ||
    process.env.NEXT_PHASE === "phase-production-build");

const serializeLanguage = (
  entry: typeof language.$inferSelect
): LanguageOption => ({
  id: entry.id,
  code: entry.code,
  name: entry.name,
  isDefault: entry.isDefault,
  isActive: entry.isActive,
  syncUiLanguage: entry.syncUiLanguage ?? false,
});

const getAllLanguagesCached = unstable_cache(
  async (): Promise<LanguageOption[]> => {
    const rows = await db.select().from(language).orderBy(asc(language.name));

    return rows.map(serializeLanguage);
  },
  ["languages:all"],
  { tags: ["languages"] }
);

export const getAllLanguages = async (): Promise<LanguageOption[]> => {
  if (isProductionBuildPhase()) {
    return [...FALLBACK_LANGUAGES];
  }

  if (shouldBypassCache) {
    const rows = await db.select().from(language).orderBy(asc(language.name));
    return rows.map(serializeLanguage);
  }
  return getAllLanguagesCached();
};

const getActiveLanguagesCached = unstable_cache(
  async (): Promise<LanguageOption[]> => {
    const rows = await db
      .select()
      .from(language)
      .where(eq(language.isActive, true))
      .orderBy(asc(language.name));

    return rows.map(serializeLanguage);
  },
  ["languages:active"],
  { tags: ["languages"] }
);

export const getActiveLanguages = async (): Promise<LanguageOption[]> => {
  if (isProductionBuildPhase()) {
    return [...FALLBACK_LANGUAGES];
  }

  if (shouldBypassCache) {
    const rows = await db
      .select()
      .from(language)
      .where(eq(language.isActive, true))
      .orderBy(asc(language.name));
    return rows.map(serializeLanguage);
  }
  return getActiveLanguagesCached();
};

const getLanguageByCodeCached = unstable_cache(
  async (code: string) => {
    const [row] = await db
      .select()
      .from(language)
      .where(eq(language.code, code))
      .limit(1);

    return row ? serializeLanguage(row) : null;
  },
  ["languages:by-code"],
  { tags: ["languages"] }
);

export const getLanguageByCode = async (code: string) => {
  if (isProductionBuildPhase()) {
    const normalizedCode = code.trim().toLowerCase();
    return (
      FALLBACK_LANGUAGES.find((entry) => entry.code === normalizedCode) ?? null
    );
  }

  if (shouldBypassCache) {
    const [row] = await db
      .select()
      .from(language)
      .where(eq(language.code, code))
      .limit(1);
    return row ? serializeLanguage(row) : null;
  }
  return getLanguageByCodeCached(code);
};

export const getDefaultLanguage = async () => {
  if (isProductionBuildPhase()) {
    return FALLBACK_LANGUAGE;
  }

  const active = await getActiveLanguages();
  const activeDefault = active.find((entry) => entry.isDefault);
  if (activeDefault) {
    return activeDefault;
  }

  if (active.length > 0) {
    return active[0] ?? null;
  }

  const rows = await db.select().from(language).orderBy(asc(language.name));

  const all = rows.map(serializeLanguage);
  return all[0] ?? null;
};

export async function resolveLanguage(preferredCode?: string | null) {
  const [languages, preferred] = await Promise.all([
    getActiveLanguages(),
    preferredCode ? getLanguageByCode(preferredCode) : Promise.resolve(null),
  ]);

  const fallback =
    languages.find((entry) => entry.isDefault) ?? languages[0] ?? null;
  const languageOption = preferred?.isActive ? preferred : fallback;

  if (!languageOption) {
    throw new Error("No active languages are configured");
  }

  return {
    languages,
    activeLanguage: languageOption,
  };
}
