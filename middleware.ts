import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { isDevelopmentEnvironment } from "./lib/constants";

const ADMIN_PATH_PREFIX = "/admin";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const PUBLIC_AUTH_PAGES = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ];
  const isAuthPage = PUBLIC_AUTH_PAGES.includes(pathname);

  try {
    const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    let token = null;

    try {
      token = await getToken({
        req: request,
        secret: authSecret,
        secureCookie: !isDevelopmentEnvironment,
      });
    } catch (error) {
      console.error("Failed to read auth token in middleware", error);
    }

    const isAdminRoute = pathname.startsWith(ADMIN_PATH_PREFIX);

    if (!token) {
      if (isAuthPage) {
        return NextResponse.next();
      }

      const callbackUrl = encodeURIComponent(request.url);
      return NextResponse.redirect(
        new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
      );
    }

    if (isAdminRoute && token.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (token && isAuthPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Unhandled middleware error", error);
    if (isAuthPage) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",
    "/admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
