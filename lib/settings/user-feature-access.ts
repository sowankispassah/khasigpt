import "server-only";

import { getUserFeatureAccessOverrides } from "@/lib/db/queries";
import type { FeatureAccessMode, FeatureAccessRole } from "@/lib/feature-access";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { isUserFeatureAccessKey } from "@/lib/feature-access-catalog";
import { withTimeout } from "@/lib/utils/async";

export type UserFeatureAccessReadStatus = "confirmed" | "stale" | "unavailable";

export type UserFeatureAccessSnapshot = {
  status: UserFeatureAccessReadStatus;
  values: Map<string, boolean>;
};

const DEFAULT_TIMEOUT_MS = 2_000;
const lastKnownByUser = new Map<string, Map<string, boolean>>();

function filteredCopy(values: ReadonlyMap<string, boolean>, keys: readonly string[]) {
  const result = new Map<string, boolean>();
  for (const key of keys) {
    const value = values.get(key);
    if (typeof value === "boolean") {
      result.set(key, value);
    }
  }
  return result;
}

export async function loadUserFeatureAccessOverrides({
  featureKeys,
  source,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userId,
}: {
  featureKeys: readonly string[];
  source: string;
  timeoutMs?: number;
  userId?: string | null;
}): Promise<UserFeatureAccessSnapshot> {
  if (!userId) {
    return { status: "confirmed", values: new Map() };
  }

  const keys = Array.from(new Set(featureKeys.filter(isUserFeatureAccessKey)));
  if (keys.length === 0) {
    return { status: "confirmed", values: new Map() };
  }

  try {
    const values = await withTimeout(
      getUserFeatureAccessOverrides(userId, keys),
      timeoutMs
    );
    const remembered = lastKnownByUser.get(userId) ?? new Map<string, boolean>();
    for (const key of keys) {
      remembered.delete(key);
    }
    for (const [key, value] of values) {
      remembered.set(key, value);
    }
    lastKnownByUser.set(userId, remembered);
    return { status: "confirmed", values };
  } catch (error) {
    const remembered = lastKnownByUser.get(userId);
    console.error("[user-feature-access] Override read failed.", {
      error,
      source,
      userId,
    });
    return remembered
      ? { status: "stale", values: filteredCopy(remembered, keys) }
      : { status: "unavailable", values: new Map() };
  }
}

export async function loadUserFeatureAccessOverride({
  featureKey,
  source,
  userId,
}: {
  featureKey: string;
  source: string;
  userId?: string | null;
}) {
  const snapshot = await loadUserFeatureAccessOverrides({
    featureKeys: [featureKey],
    source,
    userId,
  });
  return snapshot.values.get(featureKey) ?? null;
}

export function resolveUserFeatureAccess({
  mode,
  override,
  role,
}: {
  mode: FeatureAccessMode;
  override?: boolean | null;
  role: FeatureAccessRole;
}) {
  return isFeatureEnabledForRole(mode, role, override);
}

export async function isFeatureEnabledForUser({
  featureKey,
  mode,
  role,
  source,
  userId,
}: {
  featureKey: string;
  mode: FeatureAccessMode;
  role: FeatureAccessRole;
  source: string;
  userId?: string | null;
}) {
  const override = await loadUserFeatureAccessOverride({
    featureKey,
    source,
    userId,
  });
  return isFeatureEnabledForRole(mode, role, override);
}
