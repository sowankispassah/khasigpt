import { NextResponse } from "next/server";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  getDailyTokenUsageForUser,
  getSessionTokenUsageForUser,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import {
  isSessionSortOption,
  SESSION_SORT_DEFAULT,
  type SessionSortOption,
} from "@/lib/subscriptions/session-sort";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";
const RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
const SESSIONS_PAGE_SIZE = 10;
const IST_OFFSET_MS = 330 * 60 * 1000;

type RangeOption = (typeof RANGE_OPTIONS)[number];

const serializeDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

function parseRange(value: string | null): RangeOption {
  const requestedRange = Number.parseInt(value ?? "", 10);
  return RANGE_OPTIONS.includes(requestedRange as RangeOption)
    ? (requestedRange as RangeOption)
    : 14;
}

function parsePage(value: string | null) {
  const requestedPage = Number.parseInt(value ?? "", 10);
  return Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
}

function buildDailySeries(
  raw: Array<{ day: Date; totalTokens: number }>,
  range: number
) {
  const toIstKey = (date: Date) => {
    const istMillis = date.getTime() + IST_OFFSET_MS;
    const istDate = new Date(istMillis);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(istDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const istMidnightFromKey = (key: string) => {
    const [yearStr = "", monthStr = "", dayStr = ""] = key.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return new Date(key);
    }

    const midnightIstMillis = Date.UTC(year, month - 1, day);
    return new Date(midnightIstMillis - IST_OFFSET_MS);
  };

  const normalizeToIstMidnight = (date: Date) =>
    istMidnightFromKey(toIstKey(date));

  if (raw.length === 0) {
    const today = normalizeToIstMidnight(new Date());
    return Array.from({ length: range }, (_, idx) => {
      const day = new Date(today.getTime() - (range - 1 - idx) * 86_400_000);
      return { day, totalTokens: 0 };
    });
  }

  const usageMap = new Map(
    raw.map((entry) => [toIstKey(entry.day), entry.totalTokens])
  );
  const latestDataDay = raw.reduce(
    (latest, entry) =>
      entry.day.getTime() > latest.getTime() ? entry.day : latest,
    raw[0].day
  );
  const end = normalizeToIstMidnight(
    new Date(Math.max(Date.now(), latestDataDay.getTime()))
  );
  const start = new Date(end.getTime() - (range - 1) * 86_400_000);

  return Array.from({ length: range }, (_, idx) => {
    const day = new Date(start.getTime() + idx * 86_400_000);
    return {
      day,
      totalTokens: usageMap.get(toIstKey(day)) ?? 0,
    };
  });
}

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));
  const requestedPage = parsePage(searchParams.get("sessionsPage"));
  const sortParam = searchParams.get("sessionSort");
  const sessionSort: SessionSortOption = isSessionSortOption(sortParam)
    ? sortParam
    : SESSION_SORT_DEFAULT;

  const [balance, rawDailyUsage, sessionUsage] = await Promise.all([
    getUserBalanceSummary(session.user.id),
    getDailyTokenUsageForUser(session.user.id, range),
    getSessionTokenUsageForUser(session.user.id, { sortBy: sessionSort }),
  ]);

  const now = new Date();
  const isExpiredBalance =
    balance.expiresAt instanceof Date &&
    balance.expiresAt.getTime() <= now.getTime();
  const effectiveTokensRemaining = isExpiredBalance ? 0 : balance.tokensRemaining;
  const effectiveTokensTotal = isExpiredBalance ? 0 : balance.tokensTotal;
  const effectiveCreditsRemaining = isExpiredBalance
    ? 0
    : balance.creditsRemaining;
  const effectiveCreditsTotal = isExpiredBalance ? 0 : balance.creditsTotal;
  const effectiveAllocatedCredits = isExpiredBalance
    ? 0
    : balance.allocatedCredits;
  const effectiveRechargedCredits = isExpiredBalance
    ? 0
    : balance.rechargedCredits;
  const billedTokensUsed = Math.max(
    0,
    effectiveTokensTotal - effectiveTokensRemaining
  );
  const plan = isExpiredBalance ? null : balance.plan;
  const isManualPlan = plan?.id === MANUAL_TOP_UP_PLAN_ID;
  const hasPaidPlan = Boolean(plan && !isManualPlan);
  const freeCreditsRemaining = isManualPlan
    ? effectiveCreditsRemaining
    : !plan && effectiveCreditsRemaining > 0
      ? effectiveCreditsRemaining
      : 0;
  const expiresAt =
    !isExpiredBalance && balance.expiresAt
      ? new Date(balance.expiresAt)
      : null;
  const daysRemaining =
    expiresAt !== null
      ? Math.max(
          Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          0
        )
      : null;

  const dailySeries = buildDailySeries(rawDailyUsage, range);
  const peakEntry =
    dailySeries.length > 0
      ? dailySeries.reduce((prev, current) =>
          current.totalTokens > prev.totalTokens ? current : prev
        )
      : null;

  const totalSessionPages = Math.max(
    1,
    Math.ceil(sessionUsage.length / SESSIONS_PAGE_SIZE)
  );
  const sessionsPage = Math.min(requestedPage, totalSessionPages);
  const displayedSessions = sessionUsage.slice(
    0,
    sessionsPage * SESSIONS_PAGE_SIZE
  );

  return NextResponse.json(
    {
      range,
      rangeOptions: RANGE_OPTIONS,
      sessionSort,
      sessionsPage,
      totalSessionPages,
      balance: {
        tokensRemaining: effectiveTokensRemaining,
        tokensTotal: effectiveTokensTotal,
        creditsUsed: billedTokensUsed / TOKENS_PER_CREDIT,
        creditsRemaining: effectiveCreditsRemaining,
        creditsTotal: effectiveCreditsTotal,
        allocatedCredits: effectiveAllocatedCredits,
        rechargedCredits: effectiveRechargedCredits,
        freeCreditsRemaining,
        expiresAt: serializeDate(expiresAt),
        startedAt: serializeDate(balance.startedAt),
        daysRemaining,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              priceInPaise: plan.priceInPaise,
              billingCycleDays: plan.billingCycleDays,
              hasPaidPlan,
            }
          : null,
      },
      dailyUsage: dailySeries.map((entry) => ({
        date: entry.day.toISOString(),
        credits: entry.totalTokens / TOKENS_PER_CREDIT,
        totalTokens: entry.totalTokens,
      })),
      peakDay: peakEntry
        ? {
            date: peakEntry.day.toISOString(),
            credits: peakEntry.totalTokens / TOKENS_PER_CREDIT,
            totalTokens: peakEntry.totalTokens,
          }
        : null,
      sessions: displayedSessions.map((entry) => ({
        chatId: entry.chatId,
        chatTitle: entry.chatTitle,
        chatCreatedAt: serializeDate(entry.chatCreatedAt),
        lastUsedAt: serializeDate(entry.lastUsedAt),
        creditsUsed: entry.totalTokens / TOKENS_PER_CREDIT,
        totalTokens: entry.totalTokens,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
