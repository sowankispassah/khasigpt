import { NextResponse } from "next/server";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { isStudyModeEnabledForRole } from "@/lib/study/config";
import { listQuestionPaperChips } from "@/lib/study/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_ACTIONS = ["Previous year papers", "Start quiz", "Syllabus"];

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
  const chipGroups = await listQuestionPaperChips({ exam, role });

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
