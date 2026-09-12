import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/app/(auth)/actions";

export const runtime = "nodejs";

const registerSchema = z.object({
  acceptTerms: z.boolean(),
  email: z.string().email(),
  password: z.string().min(6),
});

const STATUS_CODE_BY_REGISTER_STATUS: Record<string, number> = {
  failed: 500,
  invalid_data: 400,
  rate_limited: 429,
  terms_unaccepted: 400,
  user_exists: 409,
  verification_sent: 200,
};

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());
    const formData = new FormData();
    formData.set("email", payload.email);
    formData.set("password", payload.password);
    if (payload.acceptTerms) {
      formData.set("acceptTerms", "on");
    }

    const result = await register({ status: "idle" }, formData);
    const statusCode = STATUS_CODE_BY_REGISTER_STATUS[result.status] ?? 200;

    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ status: "invalid_data" }, { status: 400 });
    }
    console.error("[api/mobile/auth/register] Failed to register user.", error);
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
