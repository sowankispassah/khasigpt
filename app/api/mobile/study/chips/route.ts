import { NextResponse } from "next/server";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { isStudyModeEnabledForRole } from "@/lib/study/config";
import { listQuestionPaperChips } from "@/lib/study/service";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_ACTIONS = ["Previous year papers", "Start quiz", "Syllabus"];
const STUDY_CHIPS_READ_TIMEOUT_MS = 8_000;

function labelForQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  if (normalized.includes("exam")) {
    return "Exams";
  }
  if (normalized.includes("role") || normalized.includes("post")) {
    return "Roles";
  }
  if (normalized.includes("year")) {
    return "Years";
  }
  return question.trim() || "Options";
}

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const enabled = await isStudyModeEnabledForRole(session.user.role);
  if (!enabled) {
    return new ChatSDKError(
      "forbidden:api",
      "Study mode is not available for this account."
    ).toResponse();
  }

  const { searchParams } = new URL(request.url);
  const exam = searchParams.get("exam")?.trim() || null;
  const role = searchParams.get("role")?.trim() || null;
  const chipGroups = await withTimeout(
    listQuestionPaperChips({ exam, role }),
    STUDY_CHIPS_READ_TIMEOUT_MS,
    () => {
      console.warn("[api/mobile/study/chips] chip query timed out.", {
        exam,
        role,
      });
    }
  ).catch((error) => {
    console.warn("[api/mobile/study/chips] chip query failed.", {
      error: error instanceof Error ? error.message : String(error),
      exam,
      role,
    });
    return null;
  });

  if (!chipGroups) {
    return NextResponse.json(
      {
        code: "service_unavailable:study_chips",
        degraded: true,
        message: "Study chips could not be confirmed. Please try again.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      actions: DEFAULT_ACTIONS,
      groups: chipGroups.map((group) => ({
        label: labelForQuestion(group.question),
        chips: group.chips,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
