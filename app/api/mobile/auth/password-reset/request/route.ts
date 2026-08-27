import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordResetAction } from "@/app/(auth)/password-reset/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const formData = new FormData();
  formData.set("email", parsed.data.email);
  const result = await requestPasswordResetAction({ status: "idle" }, formData);
  return NextResponse.json(result, {
    status: result.status === "error" ? 429 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
