import type { NextRequest } from "next/server";
import { getChatsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { isStudyModeEnabledForRole } from "@/lib/study/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;

function isTransientDatabaseConnectionError(details: string) {
  if (!details.trim()) {
    return false;
  }

  return /connect_timeout|econnrefused|econnreset|etimedout|connection terminated|network|timeout/i.test(
    details
  );
}

export async function GET(request: NextRequest) {
  try {
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
    const normalizedMode = searchParams.get("mode")?.trim().toLowerCase() ?? null;
    const mode =
      normalizedMode === "study"
        ? "study"
        : normalizedMode === "jobs"
          ? "jobs"
          : normalizedMode === "default"
            ? "default"
            : null;

    if (
      normalizedMode &&
      normalizedMode !== "default" &&
      normalizedMode !== "study" &&
      normalizedMode !== "jobs"
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

    const session = await getMobileSession(request);
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    if (mode === "study" && !(await isStudyModeEnabledForRole(session.user.role))) {
      return new ChatSDKError(
        "not_found:chat",
        "Study mode is disabled."
      ).toResponse();
    }

    if (mode === "jobs" && !(await isJobsEnabledForRole(session.user.role))) {
      return new ChatSDKError(
        "not_found:chat",
        "Jobs mode is disabled."
      ).toResponse();
    }

    const chats = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
      mode,
    });

    return Response.json(chats, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const requestedMode = request.nextUrl.searchParams
      .get("mode")
      ?.trim()
      .toLowerCase();
    const details =
      error instanceof ChatSDKError && typeof error.cause === "string"
        ? error.cause
        : error instanceof Error
          ? error.message
          : "";

    if (
      requestedMode === "jobs" &&
      /invalid input value for enum .*chat_mode.*"jobs"/i.test(details)
    ) {
      console.warn(
        "[api/mobile/chat-history] jobs mode fallback activated because chat_mode enum is missing 'jobs'"
      );
      return Response.json(
        { chats: [], hasMore: false },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Jobs-Mode-Compat": "chat_mode_enum_missing_jobs",
          },
        }
      );
    }

    const isDbError =
      error instanceof ChatSDKError &&
      error.type === "bad_request" &&
      error.surface === "database";
    if (
      (isDbError || !(error instanceof ChatSDKError)) &&
      isTransientDatabaseConnectionError(details)
    ) {
      console.warn("[api/mobile/chat-history] transient database failure", {
        mode: requestedMode ?? "default",
        details,
      });
      return Response.json(
        {
          code: "service_unavailable:history",
          degraded: true,
          message: "Chat history could not be confirmed. Please try again.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return new ChatSDKError(
      "bad_request:history",
      error instanceof Error ? error.message : "Failed to load chat history"
    ).toResponse();
  }
}
