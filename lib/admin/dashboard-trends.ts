import "server-only";

import { withAdminDatabase } from "@/lib/db/admin-database";

export type AdminTrendPoint = {
  /** Calendar day in India time, YYYY-MM-DD. */
  date: string;
  chats: number;
  /** Paid INR revenue for the day, in rupees (test purchases excluded). */
  revenue: number;
  signups: number;
};

export type AdminDashboardTrends = {
  points: AdminTrendPoint[];
  totals: {
    chatsLast7: number;
    chatsPrevious7: number;
    revenueLast30: number;
    signupsLast7: number;
    signupsPrevious7: number;
  };
};

const TREND_DAYS = 30;
const DASHBOARD_TIME_ZONE = "Asia/Kolkata";

type TrendRow = {
  chats: number | string;
  day: string | Date;
  revenue_paise: number | string;
  signups: number | string;
};

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDay(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function sum(points: AdminTrendPoint[], key: "chats" | "signups" | "revenue") {
  return points.reduce((total, point) => total + point[key], 0);
}

/**
 * Daily signups, chats and paid revenue for the last 30 India-time days in one
 * indexed read (User/Chat createdAt, PaymentTransaction status+createdAt).
 * Timestamps are stored as UTC `timestamp` values.
 */
export async function getAdminDashboardTrends(): Promise<AdminDashboardTrends> {
  const rows = await withAdminDatabase("overview.trends", (_db, client) => client<TrendRow[]>`
    WITH bounds AS (
      SELECT
        (date_trunc('day', now() AT TIME ZONE ${DASHBOARD_TIME_ZONE}) - make_interval(days => ${TREND_DAYS - 1}::int)) AS local_start
    ),
    days AS (
      SELECT generate_series(
        (SELECT local_start FROM bounds),
        date_trunc('day', now() AT TIME ZONE ${DASHBOARD_TIME_ZONE}),
        interval '1 day'
      )::date AS day
    ),
    utc_start AS (
      SELECT ((SELECT local_start FROM bounds) AT TIME ZONE ${DASHBOARD_TIME_ZONE}) AT TIME ZONE 'UTC' AS since
    ),
    signups AS (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${DASHBOARD_TIME_ZONE})::date AS day, count(*)::int AS n
      FROM "User"
      WHERE "createdAt" >= (SELECT since FROM utc_start)
      GROUP BY 1
    ),
    chats AS (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${DASHBOARD_TIME_ZONE})::date AS day, count(*)::int AS n
      FROM "Chat"
      WHERE "createdAt" >= (SELECT since FROM utc_start)
      GROUP BY 1
    ),
    revenue AS (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${DASHBOARD_TIME_ZONE})::date AS day, sum("amount")::bigint AS paise
      FROM "PaymentTransaction"
      WHERE "status" = 'paid'
        AND "createdAt" >= (SELECT since FROM utc_start)
        AND "currency" = 'INR'
        AND COALESCE("notes"->>'testPurchase', 'false') <> 'true'
      GROUP BY 1
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS day,
      COALESCE(signups.n, 0) AS signups,
      COALESCE(chats.n, 0) AS chats,
      COALESCE(revenue.paise, 0) AS revenue_paise
    FROM days
    LEFT JOIN signups ON signups.day = days.day
    LEFT JOIN chats ON chats.day = days.day
    LEFT JOIN revenue ON revenue.day = days.day
    ORDER BY days.day
  `);

  const points: AdminTrendPoint[] = rows.map((row) => ({
    chats: toNumber(row.chats),
    date: toDay(row.day),
    revenue: toNumber(row.revenue_paise) / 100,
    signups: toNumber(row.signups),
  }));
  const last7 = points.slice(-7);
  const previous7 = points.slice(-14, -7);

  return {
    points,
    totals: {
      chatsLast7: sum(last7, "chats"),
      chatsPrevious7: sum(previous7, "chats"),
      revenueLast30: sum(points, "revenue"),
      signupsLast7: sum(last7, "signups"),
      signupsPrevious7: sum(previous7, "signups"),
    },
  };
}
