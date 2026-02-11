import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isStudyModeEnabledForRole } from "@/lib/study/config";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 100;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const parsedLimit = Number.parseInt(
    searchParams.get("limit") || `${DEFAULT_HISTORY_LIMIT}`,
    10
  );
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_HISTORY_LIMIT)
      : DEFAULT_HISTORY_LIMIT;
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");
  const modeParam = searchParams.get("mode");
  const normalizedMode = modeParam?.trim().toLowerCase() ?? null;
  const mode = normalizedMode === "study" ? "study" : "default";

  if (
    normalizedMode &&
    normalizedMode !== "default" &&
    normalizedMode !== "study"
  ) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid chat history mode."
    ).toResponse();
  }

  if (startingAfter && endingBefore) {
    return new ChatSDKError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  if (mode === "study") {
    const studyEnabled = await isStudyModeEnabledForRole(session.user.role);
    if (!studyEnabled) {
      return new ChatSDKError(
        "not_found:chat",
        "Study mode is disabled."
      ).toResponse();
    }
  }

  const chats = await getChatsByUserId({
    id: session.user.id,
    limit,
    startingAfter,
    endingBefore,
    mode,
  });

  return Response.json(chats);
}
