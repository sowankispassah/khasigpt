import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadPromptReadModel } from "@/lib/api/read-models";
import { ChatSDKError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;
  const prompts = await withApiTiming("mobile.prompts", () =>
    loadPromptReadModel({
      preferredLanguage,
      role: authContext.user.role,
    })
  );

  return NextResponse.json(prompts, { headers: noStoreHeaders() });
}
