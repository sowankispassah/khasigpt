import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/api/auth";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { withTimeout } from "@/lib/utils/async";

const PROMPTS_READ_TIMEOUT_MS = 2500;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [promptsResult, iconPromptActionsResult] = await Promise.allSettled([
    withTimeout(
      loadSuggestedPrompts(preferredLanguage, authContext.user.role),
      PROMPTS_READ_TIMEOUT_MS,
      () => {
        console.error("[api/prompts] Suggested prompts timed out.", {
          timeoutMs: PROMPTS_READ_TIMEOUT_MS,
        });
      }
    ),
    withTimeout(
      loadIconPromptActions(preferredLanguage, authContext.user.role),
      PROMPTS_READ_TIMEOUT_MS,
      () => {
        console.error("[api/prompts] Icon prompts timed out.", {
          timeoutMs: PROMPTS_READ_TIMEOUT_MS,
        });
      }
    ),
  ]);
  const degradedSections: string[] = [];
  const prompts =
    promptsResult.status === "fulfilled" ? promptsResult.value : [];
  const iconPromptActions =
    iconPromptActionsResult.status === "fulfilled"
      ? iconPromptActionsResult.value
      : [];

  if (promptsResult.status === "rejected") {
    degradedSections.push("suggestedPrompts");
    console.error("[api/prompts] Suggested prompts failed.", promptsResult.reason);
  }
  if (iconPromptActionsResult.status === "rejected") {
    degradedSections.push("iconPromptActions");
    console.error(
      "[api/prompts] Icon prompt actions failed.",
      iconPromptActionsResult.reason
    );
  }

  if (degradedSections.length === 2) {
    return NextResponse.json(
      {
        code: "service_unavailable:prompts",
        message: "Prompt actions could not be confirmed. Please try again.",
        meta: {
          degraded: true,
          degradedSections,
        },
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    iconPromptActions,
    meta: {
      degraded: degradedSections.length > 0,
      degradedSections,
    },
    prompts,
  });
}
