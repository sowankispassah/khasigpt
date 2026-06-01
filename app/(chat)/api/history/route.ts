import type { NextRequest } from "next/server";
import { withApiTiming } from "@/lib/api/observability";
import { getChatsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { isStudyModeEnabledForRole } from "@/lib/study/config";
import { withTimeout } from "@/lib/utils/async";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 100;
const HISTORY_READ_TIMEOUT_MS = 8000;
const HISTORY_FEATURE_CHECK_TIMEOUT_MS = 1500;
type HistoryFeatureRole = Parameters<typeof isStudyModeEnabledForRole>[0];

function isTransientDatabaseConnectionError(details: string) {
  if (!details.trim()) {
    return false;
  }

  return /connect_timeout|econnrefused|econnreset|etimedout|connection terminated|network|timeout/i.test(
    details
  );
}

async function isHistoryModeEnabled({
  mode,
  role,
}: {
  mode: "default" | "jobs" | "study" | null;
  role: HistoryFeatureRole;
}) {
  if (mode !== "study" && mode !== "jobs") {
    return true;
  }

  const label =
    mode === "study" ? "history.study_feature_check" : "history.jobs_feature_check";
  const loader =
    mode === "study"
      ? () => isStudyModeEnabledForRole(role)
      : () => isJobsEnabledForRole(role);

  try {
    return await withTimeout(
      loader(),
      HISTORY_FEATURE_CHECK_TIMEOUT_MS,
      () => {
        console.warn(`[api/history] ${label} timed out; preserving history access.`);
      }
    );
  } catch (error) {
    console.warn(`[api/history] ${label} failed; preserving history access.`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
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

    const session = await withApiTiming(
      "history.session",
      () => getMobileSession(request),
      {
        metadata: {
          mode: mode ?? "all",
        },
        slowMs: 750,
      }
    );

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    if (
      !(await isHistoryModeEnabled({
        mode,
        role: session.user.role,
      }))
    ) {
      return new ChatSDKError(
        "not_found:chat",
        mode === "study" ? "Study mode is disabled." : "Jobs mode is disabled."
      ).toResponse();
    }

    const chats = await withApiTiming(
      "history.read",
      () =>
        withTimeout(
          getChatsByUserId({
            id: session.user.id,
            limit,
            startingAfter,
            endingBefore,
            mode,
          }),
          HISTORY_READ_TIMEOUT_MS,
          () => {
            console.warn("[api/history] chat history read timed out.", {
              limit,
              mode: mode ?? "all",
            });
          }
        ),
      {
        metadata: {
          direction: endingBefore
            ? "older"
            : startingAfter
              ? "newer"
              : "initial",
          limit,
          mode: mode ?? "all",
        },
        slowMs: 1000,
      }
    );

    return Response.json(chats, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
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
        {
          chats: [],
          degraded: true,
          degradedSections: ["jobsMode"],
          hasMore: false,
          message:
            "Jobs chat history could not be confirmed because the database enum is not migrated yet.",
        },
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
        {
          chats: [],
          code: "service_unavailable:history",
          degraded: true,
          degradedSections: ["history"],
          hasMore: false,
          message: "Chat history could not be confirmed. Please try again.",
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Chat-History-Degraded": "1",
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
