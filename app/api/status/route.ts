import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db/queries";
import {
  auditLog,
  chat,
  contactMessage,
  user,
} from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";
import { auth } from "@/app/(auth)/auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

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

const STATUS_RATE_LIMIT = {
  limit: 30,
  windowMs: 60 * 1000,
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      {
        code: "forbidden:status",
        message: "Only administrators can view service status.",
      },
      { status: 403 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `status:${clientKey}`,
    STATUS_RATE_LIMIT
  );

  if (!allowed) {
    const retryAfterSeconds = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();

    return NextResponse.json(
      {
        code: "rate_limit:status",
        message: "Too many requests. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
        },
      }
    );
  }

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
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
