export type JobsLocalFilters = {
  q: string;
  company: string;
  location: string;
  type: string;
};

export const JOBS_PAGE_SIZE = 12;
export const EMPTY_JOBS_FILTERS: JobsLocalFilters = {
  q: "", company: "", location: "", type: "",
};

export type JobsListViewState = {
  filters: JobsLocalFilters;
  visibleCount: number;
  scrollTop: number;
};

// Tab-local UI state only. Listing data remains in SWR's cache.
const views = new Map<string, JobsListViewState>();
const departures = new Map<string, {
  detailPath: string;
  returnUrl: string;
  historyLength: number;
}>();

export function getJobsListViewKey(userId: string | undefined, language: string) {
  return JSON.stringify([userId ?? "guest", language]);
}

export function readJobsListView(key: string): JobsListViewState {
  return views.get(key) ?? {
    filters: EMPTY_JOBS_FILTERS, visibleCount: JOBS_PAGE_SIZE, scrollTop: 0,
  };
}

export function saveJobsListView(key: string, state: JobsListViewState) {
  views.delete(key);
  views.set(key, state);
  if (views.size > 8) {
    const oldest = views.keys().next().value;
    if (oldest) { views.delete(oldest); departures.delete(oldest); }
  }
}

export function rememberJobsListDeparture(
  key: string, detailPath: string, returnUrl: string, historyLength: number,
) {
  // Accept only local jobs/chat destinations, never arbitrary return URLs.
  if (!/^\/jobs\/[^/?#]+$/.test(detailPath) || !/^\/chat(?:\/[^/?#]+)?(?:\?|$)/.test(returnUrl)) return;
  departures.set(key, { detailPath, returnUrl, historyLength });
}

export function getJobsListReturn(key: string, detailPath: string, historyLength: number) {
  const departure = departures.get(key);
  if (!departure || departure.detailPath !== detailPath) return null;
  return {
    href: departure.returnUrl,
    useHistoryBack: historyLength === departure.historyLength + 1,
  };
}
