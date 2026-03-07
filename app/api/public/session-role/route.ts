import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
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
