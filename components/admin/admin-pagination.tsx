import Link from "next/link";

type SearchParamValue = string | string[] | undefined;

function toSingleValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref({
  pathname,
  page,
  searchParams,
}: {
  pathname: string;
  page: number;
  searchParams?: Record<string, SearchParamValue>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const resolved = toSingleValue(value);
    if (typeof resolved === "string" && resolved.length > 0 && key !== "page") {
      params.set(key, resolved);
    }
  }

  params.set("page", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function AdminPagination({
  pathname,
  page,
  pageSize,
  totalItems,
  searchParams,
  itemLabel = "items",
}: {
  pathname: string;
  page: number;
  pageSize: number;
  totalItems: number;
  searchParams?: Record<string, SearchParamValue>;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);
  const previousHref = buildHref({
    pathname,
    page: Math.max(currentPage - 1, 1),
    searchParams,
  });
  const nextHref = buildHref({
    pathname,
    page: Math.min(currentPage + 1, totalPages),
    searchParams,
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        Showing {rangeStart}-{rangeEnd} of {totalItems.toLocaleString()} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          Page {currentPage} of {totalPages}
        </span>
        {currentPage > 1 ? (
          <Link
            className="cursor-pointer rounded-md border px-3 py-1.5 transition hover:bg-muted"
            data-nav
            href={previousHref}
            prefetch
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 text-muted-foreground">
            Previous
          </span>
        )}
        {currentPage < totalPages ? (
          <Link
            className="cursor-pointer rounded-md border px-3 py-1.5 transition hover:bg-muted"
            data-nav
            href={nextHref}
            prefetch
          >
            Next
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 text-muted-foreground">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
