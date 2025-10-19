import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

const ADMIN_PATH_PREFIX = "/admin";

const PUBLIC_AUTH_PAGES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isAuthPage = PUBLIC_AUTH_PAGES.includes(pathname);
  const isAdminRoute = pathname.startsWith(ADMIN_PATH_PREFIX);
  const session = req.auth;

  if (!session) {
    if (isAuthPage) {
      return NextResponse.next();
    }

    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && session.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

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
