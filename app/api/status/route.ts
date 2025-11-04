import { NextResponse } from "next/server";

import { db } from "@/lib/db/queries";
import {
  auditLog,
  chat,
  contactMessage,
  user,
} from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";

type CheckResult = {
  label: string;
  status: "ok" | "error";
  ms: number;
  count?: number;
  error?: string;
};

async function runCheck(
  label: string,
  fn: () => Promise<number>
): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const count = await fn();
    const ms = Date.now() - startedAt;
    return { label, status: "ok", ms, count };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[status] ${label} check failed`, error);
    return { label, status: "error", ms, error: message };
  }
}

export async function GET() {
  const checks = await Promise.all([
    runCheck("user-count", async () => {
      const [row] = await db
        .select({ total: count(user.id) })
        .from(user);
      return Number(row?.total ?? 0);
    }),
    runCheck("recent-chats", async () => {
      const rows = await db
        .select({ id: chat.id })
        .from(chat)
        .orderBy(desc(chat.createdAt))
        .limit(1);
      return rows.length;
    }),
    runCheck("recent-contact-messages", async () => {
      const rows = await db
        .select({ id: contactMessage.id })
        .from(contactMessage)
        .orderBy(desc(contactMessage.createdAt))
        .limit(1);
      return rows.length;
    }),
    runCheck("recent-audit-log", async () => {
      const rows = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(1);
      return rows.length;
    }),
  ]);

  const ok = checks.every((check) => check.status === "ok");

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    checks,
  });
}
