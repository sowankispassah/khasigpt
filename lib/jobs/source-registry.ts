import "server-only";
import {
  jobSources,
  type JobSourceConfig,
  type JobSourceLocationScope,
  type JobSourceSelectors,
} from "@/config/jobSources";
import { JOBS_SCRAPE_SOURCES_SETTING_KEY } from "@/lib/constants";
import { getAppSetting, getAppSettingUncached, setAppSetting } from "@/lib/db/queries";

export type ManagedJobSourceType = "linkedin" | "generic" | "auto";
export type ManagedJobSourceLocationScope = JobSourceLocationScope;

export type ManagedJobSource = {
  id: string;
  name: string;
  url: string;
  type: ManagedJobSourceType;
  locationScope: ManagedJobSourceLocationScope;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ManagedJobSourceInput = {
  id?: string;
  name: string;
  url: string;
  type?: ManagedJobSourceType;
  locationScope?: ManagedJobSourceLocationScope;
  enabled?: boolean;
};

type ResolveJobsScrapeSourcesResult = {
  managedSources: ManagedJobSource[];
  enabledManagedSources: ManagedJobSource[];
  scraperSources: JobSourceConfig[];
  usingFallbackSources: boolean;
};

const LINKEDIN_SELECTORS: JobSourceSelectors = {
  jobContainer: "ul.jobs-search__results-list li",
  title: "h3.base-search-card__title",
  location: ".job-search-card__location",
  company: "h4.base-search-card__subtitle",
  link: "a.base-card__full-link",
  description: ".base-search-card__metadata, .job-search-card__snippet",
  publishedAt: "time",
};

const GENERIC_SELECTORS: JobSourceSelectors = {
  jobContainer:
    "article, li, .job, [class*='job'], [data-job-id], [data-testid*='job']",
  title: "h1, h2, h3, [class*='title'], a[href*='job'], a[href*='career']",
  location:
    "[class*='location'], [data-location], .location, [class*='city'], [class*='place']",
  company:
    "[class*='company'], [data-company], .company, [class*='employer'], [class*='organization']",
  link: "a[href]",
  description:
    "[class*='description'], .description, [class*='summary'], [class*='snippet'], p",
  publishedAt: "time, [datetime], [class*='date'], [class*='posted']",
};

const MBDA_RECRUITMENT_SELECTORS: JobSourceSelectors = {
  jobContainer:
    ".view-notice-board-listing .views-row, .view-id-notice_board_listing .views-row, .view-content .views-row, .item-list-slider",
  title: ".views-field-php a, .newitem a, a[href]",
  location:
    "[class*='location'], [data-location], .location, [class*='city'], [class*='place']",
  company:
    "[class*='company'], [data-company], .company, [class*='employer'], [class*='organization']",
  link: ".views-field-php a, .newitem a, a[href]",
  description:
    ".views-field-php, .field-content, .newitem, [class*='description'], .description, [class*='summary'], p",
  publishedAt:
    ".date-display-single, [property='dc:date'], [datatype='xsd:dateTime'], time, [datetime], [class*='date'], [class*='posted']",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeType(value: unknown): ManagedJobSourceType {
  if (value === "linkedin" || value === "generic" || value === "auto") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "linkedin" ||
      normalized === "generic" ||
      normalized === "auto"
    ) {
      return normalized;
    }
  }
  return "auto";
}

function sanitizeLocationScope(value: unknown): ManagedJobSourceLocationScope {
  if (value === "meghalaya_only" || value === "all_locations") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "meghalaya_only" || normalized === "all_locations") {
      return normalized;
    }
    if (normalized === "meghalaya" || normalized === "meghalaya-only") {
      return "meghalaya_only";
    }
    if (normalized === "all" || normalized === "all-locations") {
      return "all_locations";
    }
  }
  return "meghalaya_only";
}

function sanitizeEnabled(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return true;
}

function isValidSourceId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHttpUrl(url: string) {
  const raw = url.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceNameFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    return hostname || "Job source";
  } catch {
    return "Job source";
  }
}

function defaultLocationScopeFromUrl(url: string): ManagedJobSourceLocationScope {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (hostname.endsWith("mbda.gov.in") && pathname.includes("recruitment")) {
      return "all_locations";
    }
  } catch {
    // ignore parsing failure and keep fallback
  }
  return "meghalaya_only";
}

function normalizeDateValue(value: unknown, fallbackIso: string) {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallbackIso;
}

function normalizeManagedSourceRecord(value: unknown): ManagedJobSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (!isValidSourceId(record.id)) {
    return null;
  }

  const normalizedUrl = normalizeHttpUrl(
    typeof record.url === "string" ? record.url : ""
  );
  if (!normalizedUrl) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const nameFromInput =
    typeof record.name === "string" ? normalizeWhitespace(record.name) : "";
  const locationScopeFallback = defaultLocationScopeFromUrl(normalizedUrl);

  return {
    id: record.id.trim(),
    name: nameFromInput || sourceNameFromUrl(normalizedUrl),
    url: normalizedUrl,
    type: sanitizeType(record.type),
    locationScope:
      record.locationScope === undefined
        ? locationScopeFallback
        : sanitizeLocationScope(record.locationScope),
    enabled: sanitizeEnabled(record.enabled),
    createdAt: normalizeDateValue(record.createdAt, nowIso),
    updatedAt: normalizeDateValue(record.updatedAt, nowIso),
  };
}

export function normalizeManagedJobSources(rawValue: unknown): ManagedJobSource[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const dedupedByUrl = new Map<string, ManagedJobSource>();
  const dedupedById = new Set<string>();

  for (const candidate of rawValue) {
    const normalized = normalizeManagedSourceRecord(candidate);
    if (!normalized) {
      continue;
    }
    if (dedupedById.has(normalized.id) || dedupedByUrl.has(normalized.url)) {
      continue;
    }
    dedupedById.add(normalized.id);
    dedupedByUrl.set(normalized.url, normalized);
  }

  return Array.from(dedupedByUrl.values());
}

function selectorsForSourceType(type: ManagedJobSourceType): JobSourceSelectors {
  switch (type) {
    case "linkedin":
      return LINKEDIN_SELECTORS;
    case "generic":
      return GENERIC_SELECTORS;
    case "auto":
    default:
      return GENERIC_SELECTORS;
  }
}

function selectorsForKnownSourceUrl({
  sourceUrl,
  fallbackSelectors,
}: {
  sourceUrl: string;
  fallbackSelectors: JobSourceSelectors;
}) {
  let hostname = "";
  let pathname = "";

  try {
    const parsed = new URL(sourceUrl);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return fallbackSelectors;
  }

  if (hostname.endsWith("mbda.gov.in") && pathname.includes("recruitment")) {
    return MBDA_RECRUITMENT_SELECTORS;
  }

  return fallbackSelectors;
}

export function toJobSourceConfig(source: ManagedJobSource): JobSourceConfig {
  const isLinkedInUrl = /(^|\.)linkedin\.com$/i.test(
    (() => {
      try {
        return new URL(source.url).hostname;
      } catch {
        return "";
      }
    })()
  );
  const effectiveType =
    source.type === "auto" ? (isLinkedInUrl ? "linkedin" : "generic") : source.type;
  const fallbackSelectors = selectorsForSourceType(effectiveType);
  const selectors = selectorsForKnownSourceUrl({
    sourceUrl: source.url,
    fallbackSelectors,
  });

  return {
    name: source.name,
    url: source.url,
    selectors,
    locationScope: source.locationScope,
  };
}

async function loadManagedJobSources(uncached: boolean): Promise<ManagedJobSource[]> {
  const rawValue = uncached
    ? await getAppSettingUncached<unknown>(JOBS_SCRAPE_SOURCES_SETTING_KEY)
    : await getAppSetting<unknown>(JOBS_SCRAPE_SOURCES_SETTING_KEY);
  return normalizeManagedJobSources(rawValue);
}

export async function listManagedJobSources({
  uncached = false,
}: {
  uncached?: boolean;
} = {}) {
  return loadManagedJobSources(uncached);
}

export async function resolveJobsScrapeSources({
  uncached = true,
}: {
  uncached?: boolean;
} = {}): Promise<ResolveJobsScrapeSourcesResult> {
  const managedSources = await loadManagedJobSources(uncached);
  const enabledManagedSources = managedSources.filter((source) => source.enabled);
  const usingFallbackSources = enabledManagedSources.length === 0;

  return {
    managedSources,
    enabledManagedSources,
    scraperSources: usingFallbackSources
      ? jobSources
      : enabledManagedSources.map(toJobSourceConfig),
    usingFallbackSources,
  };
}

export async function saveManagedJobSources(sources: ManagedJobSource[]) {
  await setAppSetting({
    key: JOBS_SCRAPE_SOURCES_SETTING_KEY,
    value: normalizeManagedJobSources(sources),
  });
}

export async function addManagedJobSource(
  input: ManagedJobSourceInput
): Promise<ManagedJobSource> {
  const normalizedUrl = normalizeHttpUrl(input.url);
  if (!normalizedUrl) {
    throw new Error("Source URL must be a valid http(s) URL.");
  }

  const current = await loadManagedJobSources(true);
  const nowIso = new Date().toISOString();
  const requestedId = input.id?.trim();
  const explicitName = normalizeWhitespace(input.name);

  const sourceName = explicitName || sourceNameFromUrl(normalizedUrl);
  const sourceType = sanitizeType(input.type);
  const sourceLocationScope =
    input.locationScope ?? defaultLocationScopeFromUrl(normalizedUrl);
  const sourceEnabled = input.enabled ?? true;

  const next = [...current];
  const indexById = requestedId
    ? next.findIndex((source) => source.id === requestedId)
    : -1;
  const indexByUrl = next.findIndex((source) => source.url === normalizedUrl);
  const existingIndex = indexById >= 0 ? indexById : indexByUrl;

  if (existingIndex >= 0) {
    const existing = next[existingIndex];
    const updated: ManagedJobSource = {
      ...existing,
      name: sourceName,
      url: normalizedUrl,
      type: sourceType,
      locationScope: sourceLocationScope,
      enabled: sourceEnabled,
      updatedAt: nowIso,
    };
    next.splice(existingIndex, 1);
    next.unshift(updated);
  } else {
    next.unshift({
      id: requestedId || crypto.randomUUID(),
      name: sourceName,
      url: normalizedUrl,
      type: sourceType,
      locationScope: sourceLocationScope,
      enabled: sourceEnabled,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  await saveManagedJobSources(next);

  const updated = normalizeManagedJobSources(next).find(
    (source) => source.url === normalizedUrl
  );
  if (!updated) {
    throw new Error("Failed to save source.");
  }

  return updated;
}

export async function setManagedJobSourceEnabled({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const sourceId = id.trim();
  if (!sourceId) {
    throw new Error("Source id is required.");
  }

  const current = await loadManagedJobSources(true);
  const index = current.findIndex((source) => source.id === sourceId);
  if (index < 0) {
    throw new Error("Source not found.");
  }

  const nowIso = new Date().toISOString();
  current[index] = {
    ...current[index],
    enabled,
    updatedAt: nowIso,
  };

  await saveManagedJobSources(current);
}

export async function setManagedJobSourceLocationScope({
  id,
  locationScope,
}: {
  id: string;
  locationScope: ManagedJobSourceLocationScope;
}) {
  const sourceId = id.trim();
  if (!sourceId) {
    throw new Error("Source id is required.");
  }

  const current = await loadManagedJobSources(true);
  const index = current.findIndex((source) => source.id === sourceId);
  if (index < 0) {
    throw new Error("Source not found.");
  }

  const nowIso = new Date().toISOString();
  current[index] = {
    ...current[index],
    locationScope: sanitizeLocationScope(locationScope),
    updatedAt: nowIso,
  };

  await saveManagedJobSources(current);
}

export async function deleteManagedJobSource(id: string) {
  const sourceId = id.trim();
  if (!sourceId) {
    throw new Error("Source id is required.");
  }

  const current = await loadManagedJobSources(true);
  const next = current.filter((source) => source.id !== sourceId);
  if (next.length === current.length) {
    throw new Error("Source not found.");
  }

  await saveManagedJobSources(next);
}
