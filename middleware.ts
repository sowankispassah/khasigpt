import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  ADMIN_ENTRY_PASS_COOKIE_NAME,
  PRELAUNCH_INVITE_COOKIE_NAME,
} from "@/lib/constants";
import { verifyAdminEntryPassToken } from "@/lib/security/admin-entry-pass";
import {
  DEFAULT_ADMIN_ENTRY_PATH,
  normalizeAdminEntryPathSetting,
} from "@/lib/settings/admin-entry";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_ALLOWED_ORIGINS = [
  process.env.APP_BASE_URL,
  process.env.NEXTAUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.EXPO_PUBLIC_API_BASE_URL,
  process.env.EXPO_PUBLIC_WEB_BASE_URL,
];
const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
];

const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(isProduction ? [] : LOCAL_ALLOWED_ORIGINS),
      ...CORS_ALLOWED_ORIGINS,
    ].filter((origin): origin is string => Boolean(origin))
  )
);
const CANONICAL_HOST =
  process.env.CANONICAL_HOST?.toLowerCase() ?? "khasigpt.com";
const SHOULD_ENFORCE_CANONICAL =
  process.env.NODE_ENV === "production" && typeof CANONICAL_HOST === "string";
const ONE_MINUTE = 60 * 1000;
const API_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};
const API_RATE_LIMIT_EXEMPT_PATHS = new Set([
  "/api/activity/heartbeat",
  "/api/public/site-launch",
  "/api/public/invite-access",
  "/api/public/session-role",
  "/api/public/admin-entry/verify",
]);
const SESSION_COOKIE_PREFIXES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];
const SITE_STATUS_API_PATH = "/api/public/site-launch";
const SITE_INVITE_ACCESS_API_PATH = "/api/public/invite-access";
const SITE_SESSION_ROLE_API_PATH = "/api/public/session-role";
const SITE_COMING_SOON_PATH = "/coming-soon";
const SITE_MAINTENANCE_PATH = "/maintenance";
const SITE_ADMIN_ENTRY_PATH = "/admin-entry";
const SITE_INVITE_PATH_PREFIX = "/invite/";
const SITE_STATUS_CACHE_WINDOW_MS =
  process.env.NODE_ENV === "development" ? 1000 : 15 * 1000;
const INTERNAL_STATUS_FETCH_TIMEOUT_MS_RAW = Number.parseInt(
  process.env.MIDDLEWARE_INTERNAL_FETCH_TIMEOUT_MS ?? "3000",
  10
);
const INTERNAL_STATUS_FETCH_TIMEOUT_MS =
  Number.isFinite(INTERNAL_STATUS_FETCH_TIMEOUT_MS_RAW) &&
  INTERNAL_STATUS_FETCH_TIMEOUT_MS_RAW > 0
    ? INTERNAL_STATUS_FETCH_TIMEOUT_MS_RAW
    : 3000;
type RateLimitBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateLimitBucket>();
let siteStatusCache: {
  fetchedAt: number;
  publicLaunched: boolean;
  underMaintenance: boolean;
  inviteOnlyPrelaunch: boolean;
  adminAccessEnabled: boolean;
  adminEntryPath: string;
} | null = null;
const SITE_STATUS_INTERNAL_SECRET = (
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  ""
).trim();
const kvRestUrl =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null;
const kvRestToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? null;
const hasRestKv = Boolean(kvRestUrl && kvRestToken);
const kvRestTimeoutRaw = Number.parseInt(
  process.env.KV_REST_TIMEOUT_MS ?? "800",
  10
);
const KV_REST_TIMEOUT_MS =
  Number.isFinite(kvRestTimeoutRaw) && kvRestTimeoutRaw > 0
    ? kvRestTimeoutRaw
    : 800;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = KV_REST_TIMEOUT_MS
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function incrementRestKv(key: string) {
  if (!hasRestKv) {
    return null;
  }

  try {
    const response = await fetchWithTimeout(`${kvRestUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvRestToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PTTL", key],
        ["PEXPIRE", key, API_RATE_LIMIT.windowMs.toString()],
      ]),
    });

    if (!response || !response.ok) {
      return null;
    }

    const json = (await response.json()) as { result?: unknown[] } | null;
    const results = Array.isArray(json?.result) ? json?.result : null;
    const unwrap = (value: unknown) =>
      value && typeof value === "object" && "result" in value
        ? (value as { result: unknown }).result
        : value;
    const countRaw = Array.isArray(results) ? unwrap(results[0]) : null;
    const ttlRaw = Array.isArray(results) ? unwrap(results[1]) : null;
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
    const ttl = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);

    if (!Number.isFinite(count)) {
      return null;
    }

    const resetAt =
      Number.isFinite(ttl) && ttl > 0
        ? Date.now() + ttl
        : Date.now() + API_RATE_LIMIT.windowMs;

    return {
      allowed: count <= API_RATE_LIMIT.limit,
      resetAt,
    };
  } catch {
    return null;
  }
}

async function incrementRateLimit(key: string) {
  const kvResult = await incrementRestKv(key);
  if (kvResult) {
    return kvResult;
  }

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + API_RATE_LIMIT.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (bucket.count >= API_RATE_LIMIT.limit) {
    return { allowed: false, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: true, resetAt: bucket.resetAt };
}

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || ALLOWED_ORIGINS.length === 0) {
    return null;
  }
  const normalizedOrigin = origin.toLowerCase();
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowedOrigin) => allowedOrigin.toLowerCase() === normalizedOrigin
  );

  if (!isAllowed) {
    return null;
  }

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
  return headers;
}

function applyCorsHeaders(response: NextResponse, corsHeaders: Headers | null) {
  if (!corsHeaders) {
    return response;
  }

  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

function shouldSkipApiRateLimit(pathname: string) {
  return API_RATE_LIMIT_EXEMPT_PATHS.has(pathname);
}

function hasSessionCookie(request: NextRequest) {
  const directSessionCookie =
    request.cookies.get("__Secure-authjs.session-token") ??
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-next-auth.session-token") ??
    request.cookies.get("next-auth.session-token");

  if (directSessionCookie) {
    return true;
  }

  return request.cookies.getAll().some((cookie) =>
    SESSION_COOKIE_PREFIXES.some(
      (prefix) =>
        cookie.name === prefix || cookie.name.startsWith(`${prefix}.`)
    )
  );
}

function isPageNavigationRequest(request: NextRequest) {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    !request.nextUrl.pathname.startsWith("/api/")
  );
}

function shouldBypassSiteStatusGate(pathname: string) {
  if (pathname.startsWith("/_next/")) {
    return true;
  }

  return false;
}

async function resolveSiteStatus(
  request: NextRequest
): Promise<{
  publicLaunched: boolean;
  underMaintenance: boolean;
  inviteOnlyPrelaunch: boolean;
  adminAccessEnabled: boolean;
  adminEntryPath: string;
}> {
  const now = Date.now();
  if (siteStatusCache && now - siteStatusCache.fetchedAt < SITE_STATUS_CACHE_WINDOW_MS) {
    return {
      publicLaunched: siteStatusCache.publicLaunched,
      underMaintenance: siteStatusCache.underMaintenance,
      inviteOnlyPrelaunch: siteStatusCache.inviteOnlyPrelaunch,
      adminAccessEnabled: siteStatusCache.adminAccessEnabled,
      adminEntryPath: siteStatusCache.adminEntryPath,
    };
  }

  const fallbackStatus = siteStatusCache ?? {
    fetchedAt: now,
    publicLaunched: true,
    underMaintenance: false,
    inviteOnlyPrelaunch: false,
    adminAccessEnabled: false,
    adminEntryPath: DEFAULT_ADMIN_ENTRY_PATH,
  };
  const statusUrl = request.nextUrl.clone();
  statusUrl.pathname = SITE_STATUS_API_PATH;
  statusUrl.search = "";

  try {
    const response = await fetchWithTimeout(
      statusUrl.toString(),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          ...(SITE_STATUS_INTERNAL_SECRET
            ? { "x-site-gate-secret": SITE_STATUS_INTERNAL_SECRET }
            : {}),
        },
        cache: "no-store",
      },
      INTERNAL_STATUS_FETCH_TIMEOUT_MS
    );

    if (!response || !response.ok) {
      siteStatusCache = {
        fetchedAt: now,
        publicLaunched: fallbackStatus.publicLaunched,
        underMaintenance: fallbackStatus.underMaintenance,
        inviteOnlyPrelaunch: fallbackStatus.inviteOnlyPrelaunch,
        adminAccessEnabled: fallbackStatus.adminAccessEnabled,
        adminEntryPath: fallbackStatus.adminEntryPath,
      };
      return {
        publicLaunched: fallbackStatus.publicLaunched,
        underMaintenance: fallbackStatus.underMaintenance,
        inviteOnlyPrelaunch: fallbackStatus.inviteOnlyPrelaunch,
        adminAccessEnabled: fallbackStatus.adminAccessEnabled,
        adminEntryPath: fallbackStatus.adminEntryPath,
      };
    }

    const body = (await response.json()) as
      | {
          publicLaunched?: unknown;
          underMaintenance?: unknown;
          inviteOnlyPrelaunch?: unknown;
          adminAccessEnabled?: unknown;
          adminEntryPath?: unknown;
        }
      | null;
    const publicLaunched = body?.publicLaunched === false ? false : true;
    const underMaintenance = body?.underMaintenance === true;
    const inviteOnlyPrelaunch = body?.inviteOnlyPrelaunch === true;
    const adminAccessEnabled = body?.adminAccessEnabled === true;
    const adminEntryPath = normalizeAdminEntryPathSetting(body?.adminEntryPath);

    siteStatusCache = {
      fetchedAt: now,
      publicLaunched,
      underMaintenance,
      inviteOnlyPrelaunch,
      adminAccessEnabled,
      adminEntryPath,
    };
    return {
      publicLaunched,
      underMaintenance,
      inviteOnlyPrelaunch,
      adminAccessEnabled,
      adminEntryPath,
    };
  } catch {
    siteStatusCache = {
      fetchedAt: now,
      publicLaunched: fallbackStatus.publicLaunched,
      underMaintenance: fallbackStatus.underMaintenance,
      inviteOnlyPrelaunch: fallbackStatus.inviteOnlyPrelaunch,
      adminAccessEnabled: fallbackStatus.adminAccessEnabled,
      adminEntryPath: fallbackStatus.adminEntryPath,
    };
    return {
      publicLaunched: fallbackStatus.publicLaunched,
      underMaintenance: fallbackStatus.underMaintenance,
      inviteOnlyPrelaunch: fallbackStatus.inviteOnlyPrelaunch,
      adminAccessEnabled: fallbackStatus.adminAccessEnabled,
      adminEntryPath: fallbackStatus.adminEntryPath,
    };
  }
}

async function resolveIsAdmin(request: NextRequest) {
  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (authSecret) {
    const token = await getToken({ req: request, secret: authSecret }).catch(
      () => null
    );

    if (token?.role === "admin") {
      return true;
    }

    if (token?.role && token.role !== "admin") {
      return false;
    }
  }

  if (!hasSessionCookie(request)) {
    return false;
  }

  const roleUrl = request.nextUrl.clone();
  roleUrl.pathname = SITE_SESSION_ROLE_API_PATH;
  roleUrl.search = "";

  try {
    const response = await fetchWithTimeout(roleUrl.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    }, INTERNAL_STATUS_FETCH_TIMEOUT_MS);

    if (!response || !response.ok) {
      return false;
    }

    const body = (await response.json()) as { role?: unknown } | null;
    return body?.role === "admin";
  } catch {
    return false;
  }
}

async function resolveHasInviteAccess(request: NextRequest) {
  if (!hasSessionCookie(request)) {
    return false;
  }

  const inviteAccessUrl = request.nextUrl.clone();
  inviteAccessUrl.pathname = SITE_INVITE_ACCESS_API_PATH;
  inviteAccessUrl.search = "";

  try {
    const response = await fetchWithTimeout(inviteAccessUrl.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    }, INTERNAL_STATUS_FETCH_TIMEOUT_MS);

    if (!response || !response.ok) {
      return false;
    }

    const body = (await response.json()) as { hasAccess?: unknown } | null;
    return body?.hasAccess === true;
  } catch {
    return false;
  }
}

function hasPendingPrelaunchInviteToken(request: NextRequest) {
  const token = request.cookies.get(PRELAUNCH_INVITE_COOKIE_NAME)?.value;
  return typeof token === "string" && token.trim().length > 0;
}

async function resolveHasValidAdminEntryPass(request: NextRequest) {
  const token = request.cookies.get(ADMIN_ENTRY_PASS_COOKIE_NAME)?.value;
  const payload = await verifyAdminEntryPassToken(token);
  return payload !== null;
}

function isAuthRoutePath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/password-reset" ||
    pathname === "/verify-email" ||
    pathname === "/complete-profile" ||
    pathname === "/impersonate"
  );
}

function isAdminSignInRoutePath(pathname: string) {
  return pathname === "/login";
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host")?.toLowerCase();
  if (
    SHOULD_ENFORCE_CANONICAL &&
    hostname &&
    hostname !== CANONICAL_HOST &&
    !hostname.startsWith("localhost") &&
    hostname !== "127.0.0.1"
  ) {
    const redirectUrl = new URL(request.url);
    redirectUrl.host = CANONICAL_HOST;
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (
    isPageNavigationRequest(request) &&
    !shouldBypassSiteStatusGate(request.nextUrl.pathname)
  ) {
    const pathname = request.nextUrl.pathname;
    const siteStatus = await resolveSiteStatus(request);
    const isAdmin = await resolveIsAdmin(request);

    if (!isAdmin) {
      const isAuthRoute = isAuthRoutePath(pathname);
      const configuredAdminEntryPath = siteStatus.adminEntryPath;
      const isConfiguredAdminEntryRoute = pathname === configuredAdminEntryPath;
      const allowAdminReentry =
        siteStatus.adminAccessEnabled &&
        (isConfiguredAdminEntryRoute ||
          (isAdminSignInRoutePath(pathname) &&
            (await resolveHasValidAdminEntryPass(request))));

      if (
        siteStatus.adminAccessEnabled &&
        isConfiguredAdminEntryRoute &&
        configuredAdminEntryPath !== SITE_ADMIN_ENTRY_PATH
      ) {
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = SITE_ADMIN_ENTRY_PATH;
        return NextResponse.rewrite(rewriteUrl);
      }

      if (siteStatus.underMaintenance) {
        if (!allowAdminReentry && pathname !== SITE_MAINTENANCE_PATH) {
          const landingUrl = request.nextUrl.clone();
          landingUrl.pathname = SITE_MAINTENANCE_PATH;
          landingUrl.search = "";
          return NextResponse.redirect(landingUrl);
        }
      } else if (!siteStatus.publicLaunched) {
        if (!allowAdminReentry && pathname !== SITE_COMING_SOON_PATH) {
          if (!siteStatus.inviteOnlyPrelaunch) {
            const landingUrl = request.nextUrl.clone();
            landingUrl.pathname = SITE_COMING_SOON_PATH;
            landingUrl.search = "";
            return NextResponse.redirect(landingUrl);
          }

          if (pathname.startsWith(SITE_INVITE_PATH_PREFIX)) {
            return NextResponse.next();
          }

          let hasInviteAccess: boolean | null = null;

          if (isAuthRoute) {
            if (hasPendingPrelaunchInviteToken(request)) {
              return NextResponse.next();
            }

            hasInviteAccess = await resolveHasInviteAccess(request);
            if (hasInviteAccess) {
              return NextResponse.next();
            }
          }

          if (hasInviteAccess === null) {
            hasInviteAccess = await resolveHasInviteAccess(request);
          }

          if (!hasInviteAccess) {
            const landingUrl = request.nextUrl.clone();
            landingUrl.pathname = SITE_COMING_SOON_PATH;
            landingUrl.search = "";
            return NextResponse.redirect(landingUrl);
          }
        }
      }
    }
  }

  if (
    request.nextUrl.pathname === "/" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const sessionCookie =
      request.cookies.get("__Secure-authjs.session-token") ??
      request.cookies.get("authjs.session-token") ??
      request.cookies.get("__Secure-next-auth.session-token") ??
      request.cookies.get("next-auth.session-token");
    const hasSessionCookie =
      Boolean(sessionCookie) ||
      request.cookies
        .getAll()
        .some((cookie) =>
          SESSION_COOKIE_PREFIXES.some(
            (prefix) =>
              cookie.name === prefix || cookie.name.startsWith(`${prefix}.`)
          )
        );

    let hasAuthenticatedSession = hasSessionCookie;
    if (!hasAuthenticatedSession) {
      const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
      if (authSecret) {
        const token = await getToken({ req: request, secret: authSecret });
        hasAuthenticatedSession = Boolean(token);
      }
    }

    if (hasAuthenticatedSession) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/chat";
      return NextResponse.rewrite(redirectUrl);
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", "/");
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      const preflightHeaders = new Headers(corsHeaders ?? undefined);
      if (corsHeaders) {
        preflightHeaders.set(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        );
        const requestHeaders =
          request.headers.get("Access-Control-Request-Headers") ??
          "authorization,content-type";
        preflightHeaders.set("Access-Control-Allow-Headers", requestHeaders);
      }

      return new Response(null, {
        status: 204,
        headers: preflightHeaders,
      });
    }

    if (shouldSkipApiRateLimit(request.nextUrl.pathname)) {
      const response = NextResponse.next();
      return applyCorsHeaders(response, corsHeaders);
    }

    const key = `api:${getClientKeyFromHeaders(request.headers)}`;
    const { allowed, resetAt } = await incrementRateLimit(key);

    if (!allowed) {
      const retryAfter = Math.max(
        Math.ceil((resetAt - Date.now()) / 1000),
        1
      ).toString();

      const rateLimitedResponse = NextResponse.json(
        {
          code: "rate_limit:api",
          message: "Too many requests. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter,
          },
        }
      );
      return applyCorsHeaders(rateLimitedResponse, corsHeaders);
    }

    const response = NextResponse.next();
    return applyCorsHeaders(response, corsHeaders);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/chat|_next/static|_next/image|favicon.ico|favicon.png|manifest.webmanifest|icons/|images/|robots.txt|sitemap.xml|opengraph-image.png|twitter-image.png|sw.js).*)",
  ],
};
