import { NextResponse } from "next/server";
import { getJobsAccessForRole } from "@/lib/jobs/config";
import { listJobListItems } from "@/lib/jobs/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
const JOBS_LIST_TIMEOUT_MS = 6000;

export async function GET(request: Request) {
  const session = await getMobileSession(request);

  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobsAccess = await getJobsAccessForRole(session.user.role ?? null);
  if (!jobsAccess.enabled) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const items = await withTimeout(
    listJobListItems(),
    JOBS_LIST_TIMEOUT_MS,
    () => {
      console.error("[api/jobs/list] Jobs list read timed out.", {
        timeoutMs: JOBS_LIST_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error("[api/jobs/list] Jobs list read failed.", error);
    return null;
  });

  if (!items) {
    return NextResponse.json(
      {
        error: "jobs_unavailable",
        message: "Jobs list could not be loaded right now. Please retry.",
        meta: {
          degradedSections: ["jobsList"],
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      }
    );
  }

  return NextResponse.json(
    {
      items,
      meta: {
        degradedSections: jobsAccess.degraded ? ["featureGate"] : [],
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    }
  );
}
