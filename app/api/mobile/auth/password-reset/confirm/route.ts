import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPasswordAction } from "@/app/(auth)/password-reset/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid reset request." },
      { status: 400 }
    );
  }
  const formData = new FormData();
  formData.set("token", parsed.data.token);
  formData.set("password", parsed.data.password);
  formData.set("confirmPassword", parsed.data.confirmPassword);
  const result = await resetPasswordAction({ status: "idle" }, formData);
  return NextResponse.json(result, {
    status: result.status === "error" ? 400 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
