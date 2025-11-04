import { cache } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import {
  translationKey,
  translationValue,
} from "@/lib/db/schema";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";

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

export const getTranslationBundle = cache(async (preferredCode?: string | null) => {
  try {
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
  } catch (error) {
    console.error("[i18n] Falling back to static translations.", error);
    return {
      languages: [FALLBACK_LANGUAGE],
      activeLanguage: FALLBACK_LANGUAGE,
      dictionary: mergeWithStaticDictionary({}),
    };
  }
});

export async function getTranslationForKey(
  preferredCode: string | null | undefined,
  definition: TranslationDefinition
) {
  try {
    await registerTranslationKeys([definition]);

    const { activeLanguage } = await resolveLanguage(preferredCode);

    const [result] = await db
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
      .limit(1);

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
    await registerTranslationKeys(definitions);

    const { activeLanguage } = await resolveLanguage(preferredCode);
    const keys = definitions.map((definition) => definition.key);

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
      .where(inArray(translationKey.key, keys));

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
