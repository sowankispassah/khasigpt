import { cache } from "react";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import { language } from "@/lib/db/schema";

export type LanguageOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
};

const serializeLanguage = (entry: typeof language.$inferSelect): LanguageOption => ({
  id: entry.id,
  code: entry.code,
  name: entry.name,
  isDefault: entry.isDefault,
  isActive: entry.isActive,
});

export const getAllLanguages = cache(async (): Promise<LanguageOption[]> => {
  const rows = await db
    .select()
    .from(language)
    .orderBy(asc(language.name));

  return rows.map(serializeLanguage);
});

export const getActiveLanguages = cache(async (): Promise<LanguageOption[]> => {
  const rows = await db
    .select()
    .from(language)
    .where(eq(language.isActive, true))
    .orderBy(asc(language.name));

  return rows.map(serializeLanguage);
});

export const getLanguageByCode = cache(async (code: string) => {
  const [row] = await db
    .select()
    .from(language)
    .where(eq(language.code, code))
    .limit(1);

  return row ? serializeLanguage(row) : null;
});

export const getDefaultLanguage = cache(async () => {
  const active = await getActiveLanguages();
  const activeDefault = active.find((entry) => entry.isDefault);
  if (activeDefault) {
    return activeDefault;
  }

  if (active.length > 0) {
    return active[0]!;
  }

  const all = await getAllLanguages();
  return all[0] ?? null;
});

export async function resolveLanguage(preferredCode?: string | null) {
  const [languages, preferred] = await Promise.all([
    getActiveLanguages(),
    preferredCode ? getLanguageByCode(preferredCode) : Promise.resolve(null),
  ]);

  const fallback = languages.find((entry) => entry.isDefault) ?? languages[0] ?? null;
  const languageOption =
    preferred && preferred.isActive ? preferred : fallback;

  if (!languageOption) {
    throw new Error("No active languages are configured");
  }

  return {
    languages,
    activeLanguage: languageOption,
  };
}
