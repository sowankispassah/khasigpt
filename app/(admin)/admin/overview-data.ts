import "server-only";

import { unstable_cache } from "next/cache";

import {
  getChatCount,
  getContactMessageCount,
  getUserCount,
  listAuditLog,
  listChats,
  listContactMessages,
  listUsers,
} from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

const DEFAULT_REVALIDATE_SECONDS = 60;

const cachedLoadOverview = unstable_cache(
  async () => {
    const queryTimeoutRaw = Number.parseInt(
      process.env.ADMIN_QUERY_TIMEOUT_MS ?? "",
      10
    );
    const QUERY_TIMEOUT_MS =
      Number.isFinite(queryTimeoutRaw) && queryTimeoutRaw > 0
        ? queryTimeoutRaw
        : 4000;

    async function safeQuery<T>(
      label: string,
      promise: Promise<T>,
      fallback: T
    ): Promise<T> {
      const startedAt = Date.now();
      try {
        const result = await withTimeout(promise, QUERY_TIMEOUT_MS, () => {
          console.warn(
            `[admin] Query "${label}" timed out after ${QUERY_TIMEOUT_MS}ms.`
          );
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startedAt;
        console.error(
          `[admin] Failed to load ${label} after ${duration}ms`,
          error
        );
        return fallback;
      }
    }

    const [
      userCount,
      chatCount,
      contactMessageCount,
      recentUsers,
      recentChats,
      recentAudits,
      recentContactMessages,
    ] = await Promise.all([
      safeQuery("user count", getUserCount(), 0),
      safeQuery("chat count", getChatCount(), 0),
      safeQuery("contact message count", getContactMessageCount(), 0),
      safeQuery("recent users", listUsers({ limit: 5 }), []),
      safeQuery("recent chats", listChats({ limit: 5 }), []),
      safeQuery("recent audit log entries", listAuditLog({ limit: 5 }), []),
      safeQuery(
        "recent contact messages",
        listContactMessages({ limit: 5 }),
        []
      ),
    ]);

    return {
      userCount,
      chatCount,
      contactMessageCount,
      recentUsers,
      recentChats,
      recentAudits,
      recentContactMessages,
    };
  },
  ["admin:overview"],
  { revalidate: DEFAULT_REVALIDATE_SECONDS }
);

export function loadAdminOverviewSnapshot() {
  return cachedLoadOverview();
}
