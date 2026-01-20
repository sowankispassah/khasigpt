import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const redirectTo = sanitizeRedirectPath(
    searchParams.get("redirectTo"),
    new URL(request.url).origin
  );

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const result = await signIn("impersonate", {
      token,
      redirect: false,
      redirectTo,
    });

    const url = (result as any)?.url ?? (result as any)?.redirect ?? null;
    if (typeof url === "string") {
      return NextResponse.redirect(url);
    }

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch (_error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
