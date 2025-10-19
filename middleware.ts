import { type NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./app/(auth)/auth.config";

const { auth: edgeAuth } = NextAuth(authConfig);
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

  const session = await edgeAuth(request);
  const isAdminRoute = pathname.startsWith(ADMIN_PATH_PREFIX);

  if (!session) {
    if (isAuthPage) {
      return NextResponse.next();
    }

    const callbackUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, request.url)
    );
  }

  if (isAdminRoute && session.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
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
