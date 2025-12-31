import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";

export async function GET() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prompts = await loadSuggestedPrompts(preferredLanguage);

  return NextResponse.json({ prompts });
}
