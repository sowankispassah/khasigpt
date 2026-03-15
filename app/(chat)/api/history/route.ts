import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { isStudyModeEnabledForRole } from "@/lib/study/config";
import { withTimeout } from "@/lib/utils/async";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 100;
const HISTORY_QUERY_TIMEOUT_MS = 12_000;

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
    const modeParam = searchParams.get("mode");
    const normalizedMode = modeParam?.trim().toLowerCase() ?? null;
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

    if (mode === "jobs") {
      const jobsEnabled = await isJobsEnabledForRole(session.user.role);
      if (!jobsEnabled) {
        return new ChatSDKError(
          "not_found:chat",
          "Jobs mode is disabled."
        ).toResponse();
      }
    }

    const chats = await withTimeout(
      getChatsByUserId({
        id: session.user.id,
        limit,
        startingAfter,
        endingBefore,
        mode,
      }),
      HISTORY_QUERY_TIMEOUT_MS,
      () => {
        console.warn(
          `[api/history] getChatsByUserId timed out after ${HISTORY_QUERY_TIMEOUT_MS}ms`
        );
      }
    );

    return Response.json(chats);
  } catch (error) {
    const requestedMode = request.nextUrl.searchParams.get("mode")?.trim().toLowerCase();
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
        "[api/history] jobs mode fallback activated because chat_mode enum is missing 'jobs'"
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
      console.warn("[api/history] transient database connection failure", {
        mode: requestedMode ?? "default",
        details,
      });
      return Response.json(
        { chats: [], hasMore: false },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-History-Fallback": "transient_database_connection_error",
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
