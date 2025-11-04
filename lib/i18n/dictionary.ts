import { cache } from "react";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/queries";
import {
  translationKey,
  translationValue,
} from "@/lib/db/schema";

import { resolveLanguage } from "./languages";

export type TranslationDefinition = {
  key: string;
  defaultText: string;
  description?: string;
};

export async function registerTranslationKeys(
  definitions: TranslationDefinition[]
) {
  if (!definitions.length) {
    return;
  }

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
}

export const getTranslationBundle = cache(async (preferredCode?: string | null) => {
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
    dictionary,
  };
});

export async function getTranslationForKey(
  preferredCode: string | null | undefined,
  definition: TranslationDefinition
) {
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
}

export async function getTranslationsForKeys(
  preferredCode: string | null | undefined,
  definitions: TranslationDefinition[]
) {
  if (!definitions.length) {
    return {};
  }

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
}
