import "server-only";
import { eq, sql } from "drizzle-orm";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { db } from "@/lib/db/queries";
import { appSetting } from "@/lib/db/schema";
import { GOOGLE_BUDGET_SETTING_KEY, GOOGLE_PHOTO_RESERVATION, type GoogleBudgetInput, googleBillingMonth, parseGoogleBudget } from "./google-budget-policy";
import { EXPLORE_PROVIDER_SETTING_KEY, type ExploreProvider } from "./providers";
import { SERPENT_MAPS_QUICK_SETTING_KEY } from "./serpent-policy";

export async function readGoogleBudget() {
  return withAdminDatabase("explore.google-budget.read", async (database) => {
    const [row] = await database.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, GOOGLE_BUDGET_SETTING_KEY)).limit(1);
    return parseGoogleBudget(row?.value);
  });
}

// One conditional UPDATE locks the indexed settings row across all Vercel instances.
// A timeout/crash may leave a conservative overcount; never refund attempted calls.
export async function reserveGoogleBudget() {
  const month = googleBillingMonth();
  const sameMonth = sql`value->>'month' = ${month}`;
  const usedSearch = sql`CASE WHEN ${sameMonth} THEN (value->>'searchUsed')::integer ELSE 0 END`;
  const usedPhotos = sql`CASE WHEN ${sameMonth} THEN (value->>'photoUsed')::integer ELSE 0 END`;
  const offsetSearch = sql`CASE WHEN ${sameMonth} THEN (value->>'searchOffset')::integer ELSE 0 END`;
  const offsetPhotos = sql`CASE WHEN ${sameMonth} THEN (value->>'photoOffset')::integer ELSE 0 END`;
  const rows = await db.execute(sql`
    UPDATE "AppSetting" SET value = value || jsonb_build_object(
      'month', ${month}::text, 'searchUsed', (${usedSearch}) + 1,
      'photoUsed', (${usedPhotos}) + ${GOOGLE_PHOTO_RESERVATION}::integer,
      'searchOffset', (${offsetSearch}), 'photoOffset', (${offsetPhotos})
    ), "updatedAt" = now()
    WHERE key = ${GOOGLE_BUDGET_SETTING_KEY} AND value->>'enabled' = 'true'
      AND (${usedSearch}) + (${offsetSearch}) + 1 <= (value->>'searchLimit')::integer
      AND (${usedPhotos}) + (${offsetPhotos}) + ${GOOGLE_PHOTO_RESERVATION}::integer <= (value->>'photoLimit')::integer
    RETURNING key
  `);
  return rows.length ? { month, photos: GOOGLE_PHOTO_RESERVATION } : null;
}
export async function releaseUnusedGooglePhotos(month: string, unused: number) {
  if (unused <= 0) return;
  if (!Number.isInteger(unused) || unused > GOOGLE_PHOTO_RESERVATION) throw new Error("invalid_photo_release");
  await db.execute(sql`UPDATE "AppSetting" SET value = jsonb_set(value, '{photoUsed}', to_jsonb(greatest(0, (value->>'photoUsed')::integer - ${unused}::integer))), "updatedAt" = now() WHERE key = ${GOOGLE_BUDGET_SETTING_KEY} AND value->>'month' = ${month}`);
}

export async function saveGoogleBudgetAndProvider(provider: ExploreProvider, input?: GoogleBudgetInput, serpentMapsQuickEnabled?: boolean) {
  const month = googleBillingMonth();
  if (input && input.month !== month) throw new Error("stale_billing_month");
  return withAdminDatabase("explore.google-budget.save", (database) => database.transaction(async (tx) => {
    let budget: ReturnType<typeof parseGoogleBudget> | undefined;
    if (input) {
      await tx.insert(appSetting).values({ key: GOOGLE_BUDGET_SETTING_KEY, value: parseGoogleBudget(undefined, month) }).onConflictDoNothing();
      const [row] = await tx.select().from(appSetting).where(eq(appSetting.key, GOOGLE_BUDGET_SETTING_KEY)).for("update");
      const previous = parseGoogleBudget(row.value, month);
      budget = parseGoogleBudget({ ...previous, ...input, searchOffset: Math.max(previous.searchOffset, input.searchOffset), photoOffset: Math.max(previous.photoOffset, input.photoOffset) }, month);
      await tx.update(appSetting).set({ value: budget, updatedAt: new Date() }).where(eq(appSetting.key, GOOGLE_BUDGET_SETTING_KEY));
    }
    if (serpentMapsQuickEnabled !== undefined) {
      await tx.insert(appSetting).values({ key: SERPENT_MAPS_QUICK_SETTING_KEY, value: serpentMapsQuickEnabled }).onConflictDoUpdate({ target: appSetting.key, set: { value: serpentMapsQuickEnabled, updatedAt: new Date() } });
    }
    await tx.insert(appSetting).values({ key: EXPLORE_PROVIDER_SETTING_KEY, value: provider }).onConflictDoUpdate({ target: appSetting.key, set: { value: provider, updatedAt: new Date() } });
    return budget;
  }), { retry: false });
}
