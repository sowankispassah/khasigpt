import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/queries";
import {
  type ExploreCategory,
  type ExploreSubcategory,
  exploreCategory,
  exploreSubcategory,
} from "@/lib/db/schema";
import {
  EXPLORE_LOCATION_MODES,
  EXPLORE_RESULT_TYPES,
  EXPLORE_SEARCH_TYPES,
  type ExploreCategoryDto,
  type ExploreLocationMode,
  type ExploreResultType,
  type ExploreSearchType,
  type ExploreSubcategoryDto,
} from "./types";

const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  iconName: z.string().trim().min(1).max(64),
  searchType: z.enum(EXPLORE_SEARCH_TYPES),
  searchQuery: z.string().trim().min(1).max(500),
  locationMode: z.enum(EXPLORE_LOCATION_MODES),
  resultType: z.enum(EXPLORE_RESULT_TYPES),
  suggestedPrompts: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  isEnabled: z.boolean().default(true),
  showOnHome: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(100_000).default(0),
});

const subcategoryInputSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  iconName: z.string().trim().min(1).max(64),
  searchQuery: z.string().trim().min(1).max(500),
  searchTypeOverride: z.enum(EXPLORE_SEARCH_TYPES).nullable().optional(),
  locationModeOverride: z.enum(EXPLORE_LOCATION_MODES).nullable().optional(),
  isEnabled: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(100_000).default(0),
});

export type ExploreCategoryInput = z.infer<typeof categoryInputSchema>;
export type ExploreSubcategoryInput = z.infer<typeof subcategoryInputSchema>;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "explore";
}

function normalizePrompts(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function toSubcategoryDto(row: ExploreSubcategory): ExploreSubcategoryDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    iconName: row.iconName || "MapPin",
    searchQuery: row.searchQuery,
    searchTypeOverride: EXPLORE_SEARCH_TYPES.includes(
      row.searchTypeOverride as ExploreSearchType
    )
      ? (row.searchTypeOverride as ExploreSearchType)
      : null,
    locationModeOverride: EXPLORE_LOCATION_MODES.includes(
      row.locationModeOverride as ExploreLocationMode
    )
      ? (row.locationModeOverride as ExploreLocationMode)
      : null,
    isEnabled: row.isEnabled,
    displayOrder: row.displayOrder,
  };
}

function toCategoryDto(
  row: ExploreCategory,
  subcategories: ExploreSubcategory[]
): ExploreCategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    iconName: row.iconName || "Compass",
    searchType: EXPLORE_SEARCH_TYPES.includes(row.searchType as ExploreSearchType)
      ? (row.searchType as ExploreSearchType)
      : "hybrid",
    searchQuery: row.searchQuery,
    locationMode: EXPLORE_LOCATION_MODES.includes(
      row.locationMode as ExploreLocationMode
    )
      ? (row.locationMode as ExploreLocationMode)
      : "current_or_selected",
    resultType: EXPLORE_RESULT_TYPES.includes(row.resultType as ExploreResultType)
      ? (row.resultType as ExploreResultType)
      : "standard",
    suggestedPrompts: normalizePrompts(row.suggestedPrompts),
    isEnabled: row.isEnabled,
    showOnHome: row.showOnHome,
    displayOrder: row.displayOrder,
    subcategories: subcategories.map(toSubcategoryDto),
  };
}

export async function listExploreCategories({ admin = false } = {}) {
  const categoryRows = await db
    .select()
    .from(exploreCategory)
    .where(
      admin
        ? undefined
        : and(eq(exploreCategory.isEnabled, true), eq(exploreCategory.showOnHome, true))
    )
    .orderBy(asc(exploreCategory.displayOrder), asc(exploreCategory.name));

  if (categoryRows.length === 0) return [];
  const categoryIds = categoryRows.map((row) => row.id);
  const subcategoryRows = await db
    .select()
    .from(exploreSubcategory)
    .where(
      admin
        ? inArray(exploreSubcategory.categoryId, categoryIds)
        : and(
            inArray(exploreSubcategory.categoryId, categoryIds),
            eq(exploreSubcategory.isEnabled, true)
          )
    )
    .orderBy(
      asc(exploreSubcategory.categoryId),
      asc(exploreSubcategory.displayOrder),
      asc(exploreSubcategory.name)
    );
  const byCategory = new Map<string, ExploreSubcategory[]>();
  for (const row of subcategoryRows) {
    const current = byCategory.get(row.categoryId) ?? [];
    current.push(row);
    byCategory.set(row.categoryId, current);
  }
  return categoryRows.map((row) =>
    toCategoryDto(row, byCategory.get(row.id) ?? [])
  );
}

async function uniqueCategorySlug(name: string, excludeId?: string) {
  const base = slugify(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const [existing] = await db
      .select({ id: exploreCategory.id })
      .from(exploreCategory)
      .where(eq(exploreCategory.slug, candidate))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function uniqueSubcategorySlug(categoryId: string, name: string, excludeId?: string) {
  const base = slugify(name);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const [existing] = await db
      .select({ id: exploreSubcategory.id })
      .from(exploreSubcategory)
      .where(
        and(
          eq(exploreSubcategory.categoryId, categoryId),
          eq(exploreSubcategory.slug, candidate)
        )
      )
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function createExploreCategory(input: unknown) {
  const value = categoryInputSchema.parse(input);
  const [created] = await db
    .insert(exploreCategory)
    .values({ ...value, description: value.description || null, slug: await uniqueCategorySlug(value.name) })
    .returning();
  return created;
}

export async function updateExploreCategory(id: string, input: unknown) {
  const value = categoryInputSchema.parse(input);
  const [updated] = await db
    .update(exploreCategory)
    .set({
      ...value,
      description: value.description || null,
      slug: await uniqueCategorySlug(value.name, id),
      updatedAt: new Date(),
    })
    .where(eq(exploreCategory.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteExploreCategory(id: string) {
  const [deleted] = await db
    .delete(exploreCategory)
    .where(eq(exploreCategory.id, id))
    .returning({ id: exploreCategory.id });
  return deleted ?? null;
}

export async function createExploreSubcategory(input: unknown) {
  const value = subcategoryInputSchema.parse(input);
  const [created] = await db
    .insert(exploreSubcategory)
    .values({
      ...value,
      description: value.description || null,
      slug: await uniqueSubcategorySlug(value.categoryId, value.name),
    })
    .returning();
  return created;
}

export async function updateExploreSubcategory(id: string, input: unknown) {
  const value = subcategoryInputSchema.parse(input);
  const [updated] = await db
    .update(exploreSubcategory)
    .set({
      ...value,
      description: value.description || null,
      slug: await uniqueSubcategorySlug(value.categoryId, value.name, id),
      updatedAt: new Date(),
    })
    .where(eq(exploreSubcategory.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteExploreSubcategory(id: string) {
  const [deleted] = await db
    .delete(exploreSubcategory)
    .where(eq(exploreSubcategory.id, id))
    .returning({ id: exploreSubcategory.id });
  return deleted ?? null;
}

export async function reorderExploreItems(
  kind: "category" | "subcategory",
  ids: string[]
) {
  const uniqueIds = Array.from(new Set(ids));
  await db.transaction(async (tx) => {
    for (const [displayOrder, id] of uniqueIds.entries()) {
      if (kind === "category") {
        await tx
          .update(exploreCategory)
          .set({ displayOrder, updatedAt: new Date() })
          .where(eq(exploreCategory.id, id));
      } else {
        await tx
          .update(exploreSubcategory)
          .set({ displayOrder, updatedAt: new Date() })
          .where(eq(exploreSubcategory.id, id));
      }
    }
  });
}

export async function getEnabledExploreSelection({
  categoryId,
  subcategoryId,
}: {
  categoryId?: string | null;
  subcategoryId?: string | null;
}) {
  if (!categoryId) return { category: null, subcategory: null };
  const [category] = await db
    .select()
    .from(exploreCategory)
    .where(and(eq(exploreCategory.id, categoryId), eq(exploreCategory.isEnabled, true)))
    .limit(1);
  if (!category) return { category: null, subcategory: null };
  let subcategory: ExploreSubcategory | null = null;
  if (subcategoryId) {
    const [row] = await db
      .select()
      .from(exploreSubcategory)
      .where(
        and(
          eq(exploreSubcategory.id, subcategoryId),
          eq(exploreSubcategory.categoryId, category.id),
          eq(exploreSubcategory.isEnabled, true)
        )
      )
      .limit(1);
    subcategory = row ?? null;
  }
  return { category: toCategoryDto(category, []), subcategory: subcategory ? toSubcategoryDto(subcategory) : null };
}
