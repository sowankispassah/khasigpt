import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/api/auth";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prompts = await loadSuggestedPrompts(
    preferredLanguage,
    authContext.user.role
  );

  return NextResponse.json({ prompts });
}
