import { NextResponse } from "next/server";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { listJobListItems, listJobListPageItems } from "@/lib/jobs/service";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 40;

function normalizeFilter(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function getJobTypeLabel(value: string) {
  const normalized = normalizeFilter(value);
  if (!normalized) {
    return "Other";
  }
  if (normalized === "government") {
    return "Government";
  }
  if (normalized === "private") {
    return "Private";
  }
  return value.trim();
}

function parseBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(parsed, max));
}

export async function GET(request: Request) {
  const session = await getMobileSession(request);

  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobsEnabled = await isJobsEnabledForRole(session.user.role ?? null);
  if (!jobsEnabled) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = parseBoundedInt(
    url.searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  );
  const offset = parseBoundedInt(url.searchParams.get("offset"), 0, 0, 100_000);
  const qFilter = normalizeFilter(url.searchParams.get("q"));
  const companyFilter = normalizeFilter(url.searchParams.get("company"));
  const locationFilter = normalizeFilter(url.searchParams.get("location"));
  const typeFilter = normalizeFilter(url.searchParams.get("type"));
  const includeFacets = url.searchParams.get("includeFacets") !== "0";
  const facetsOnly = url.searchParams.get("facetsOnly") === "1";
  const hasFilters = Boolean(
    qFilter || companyFilter || locationFilter || typeFilter
  );

  if (!hasFilters && !includeFacets && !facetsOnly) {
    const page = await listJobListPageItems({ limit, offset });

    return NextResponse.json(
      {
        facets: {
          companies: [],
          locations: [],
          types: [],
        },
        items: page.items,
        limit,
        offset,
        total: page.total,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  }

  const allItems = await listJobListItems();

  const facets = {
    companies: Array.from(
      new Set(allItems.map((job) => job.company.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right)),
    locations: Array.from(
      new Set(allItems.map((job) => job.location.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right)),
    types: Array.from(
      new Set(
        allItems
          .map((job) => getJobTypeLabel(job.employmentType).trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right)),
  };

  if (facetsOnly) {
    return NextResponse.json(
      {
        facets,
        items: [],
        limit: 0,
        offset: 0,
        total: allItems.length,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  }

  const filteredItems = allItems.filter((job) => {
    if (companyFilter && normalizeFilter(job.company) !== companyFilter) {
      return false;
    }
    if (locationFilter && normalizeFilter(job.location) !== locationFilter) {
      return false;
    }
    if (
      typeFilter &&
      normalizeFilter(getJobTypeLabel(job.employmentType)) !== typeFilter
    ) {
      return false;
    }
    if (!qFilter) {
      return true;
    }

    return [
      job.title,
      job.company,
      job.location,
      job.employmentType,
      job.descriptionSnippet,
      job.salaryLabel,
    ]
      .join(" ")
      .toLowerCase()
      .includes(qFilter);
  });

  const items = filteredItems.slice(offset, offset + limit);

  return NextResponse.json(
    {
      facets,
      items,
      limit,
      offset,
      total: filteredItems.length,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    }
  );
}
