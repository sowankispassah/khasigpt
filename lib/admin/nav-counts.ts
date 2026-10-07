import "server-only";

import { getStorageAlertCount } from "@/lib/admin/chat-storage";
import { getNewUserCount } from "@/lib/admin/user-notifications";
import {
  getUnreadContactMessageCounts,
  getUnviewedAccountDeletionRequestCount,
} from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

/** A null count was not confirmed; clients keep their last confirmed value. */
export type AdminNavCounts = {
  accountDeletionRequests: number | null;
  contacts: number | null;
  reports: number | null;
  storage: number | null;
  users: number | null;
};

const NAV_COUNT_TIMEOUT_MS = 4000;

function confirmedCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

async function readCount<T>(label: string, read: () => Promise<T>) {
  try {
    return await withTimeout(read(), NAV_COUNT_TIMEOUT_MS);
  } catch {
    console.warn(`[admin.nav-counts] ${label} unavailable.`);
    return null;
  }
}

// One request for every sidebar badge instead of four, so badge refreshes take
// one auth check and rate-limit hit and queue fewer reads beside the page.
export async function loadAdminNavCounts(adminId: string): Promise<AdminNavCounts> {
  const [users, accountDeletionRequests, contactCounts, storage] = await Promise.all([
    readCount("users", () => getNewUserCount(adminId)),
    readCount("account deletion requests", () => getUnviewedAccountDeletionRequestCount()),
    readCount("contacts", () => getUnreadContactMessageCounts()),
    readCount("storage", () => getStorageAlertCount()),
  ]);

  return {
    accountDeletionRequests: confirmedCount(accountDeletionRequests),
    contacts: confirmedCount(contactCounts?.contacts),
    reports: confirmedCount(contactCounts?.reports),
    storage: confirmedCount(storage),
    users: confirmedCount(users),
  };
}
