import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/app/(auth)/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (secret) {
      const token = await getToken({ req: request, secret }).catch(() => null);
      if (token) {
        const role = typeof token.role === "string" ? token.role : null;
        return NextResponse.json(
          {
            authenticated: true,
            role,
          },
          {
            headers: {
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }

    const session = await auth();
    const role = session?.user?.role ?? null;

    return NextResponse.json(
      {
        authenticated: Boolean(session?.user),
        role,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[api/public/session-role] Failed to resolve session role.",
      error
    );
    return NextResponse.json(
      {
        authenticated: false,
        role: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
