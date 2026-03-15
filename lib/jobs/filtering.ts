import { isJobSector, resolveJobSector, type JobSector } from "@/lib/jobs/sector";
import type { JobPostingRecord } from "@/lib/jobs/types";

type EmploymentTypeFilter =
  | "part-time"
  | "full-time"
  | "contract"
  | "internship";

type SectorFilter = Exclude<JobSector, "unknown">;

type QualificationFilter =
  | "10th"
  | "12th"
  | "graduate"
  | "postgraduate"
  | "diploma"
  | "iti";

export type JobsFilterState = {
  location: string | null;
  employmentType: EmploymentTypeFilter | null;
  sector: SectorFilter | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryKnownOnly: boolean;
  qualifications: QualificationFilter[];
  keywords: string[];
};

export type JobsFilterResolution = {
  state: JobsFilterState;
  filteredJobs: JobPostingRecord[];
  hasActiveFilters: boolean;
  summary: string;
  clarification: string | null;
};

export function hasStructuredJobsFilters(state: JobsFilterState) {
  return (
    Boolean(state.location) ||
    Boolean(state.employmentType) ||
    Boolean(state.sector) ||
    state.salaryMin !== null ||
    state.salaryMax !== null ||
    state.salaryKnownOnly ||
    state.qualifications.length > 0
  );
}

type SalaryRange = {
  min: number | null;
  max: number | null;
};

type ParsedFilterUpdate = {
  reset: boolean;
  location?: string;
  employmentType?: EmploymentTypeFilter;
  sector?: SectorFilter;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryKnownOnly?: boolean;
  qualifications?: QualificationFilter[];
  keywords?: string[];
  salaryMentioned: boolean;
  salaryParsed: boolean;
  qualificationMentioned: boolean;
  qualificationParsed: boolean;
};

const WORD_STOPLIST = new Set([
  "a",
  "about",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "available",
  "be",
  "between",
  "by",
  "has",
  "have",
  "for",
  "from",
  "get",
  "govt",
  "government",
  "in",
  "is",
  "jobs",
  "job",
  "list",
  "me",
  "of",
  "on",
  "only",
  "or",
  "pass",
  "please",
  "private",
  "approx",
  "approximately",
  "around",
  "near",
  "qualification",
  "salary",
  "show",
  "that",
  "there",
  "these",
  "those",
  "the",
  "to",
  "under",
  "where",
  "with",
]);

const QUALIFICATION_PATTERNS: Array<{
  id: QualificationFilter;
  label: string;
  regex: RegExp;
}> = [
  {
    id: "10th",
    label: "10th pass",
    regex: /\b(10th|class\s*10|matric(?:ulation)?)\b/i,
  },
  {
    id: "12th",
    label: "12th pass",
    regex: /\b(12th|class\s*12|higher\s*secondary|hs\s*pass)\b/i,
  },
  {
    id: "graduate",
    label: "graduate",
    regex: /\b(graduate|graduation|bachelor(?:'s)?|degree)\b/i,
  },
  {
    id: "postgraduate",
    label: "postgraduate",
    regex: /\b(post\s*graduate|postgraduate|master(?:'s)?|pg)\b/i,
  },
  {
    id: "diploma",
    label: "diploma",
    regex: /\b(diploma|polytechnic)\b/i,
  },
  {
    id: "iti",
    label: "iti",
    regex: /\biti\b/i,
  },
];

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return compactText(value).toLowerCase();
}

function toUniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => normalize(value)).filter(Boolean)));
}

function parseNumericValue(raw: string, unitRaw: string | undefined) {
  const base = Number.parseFloat(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(base)) {
    return null;
  }

  const unit = (unitRaw ?? "").trim().toLowerCase();
  if (!unit) {
    return Math.round(base);
  }

  if (unit === "k" || unit === "thousand") {
    return Math.round(base * 1_000);
  }
  if (unit === "lakh" || unit === "lakhs") {
    return Math.round(base * 100_000);
  }
  if (unit === "crore" || unit === "crores") {
    return Math.round(base * 10_000_000);
  }

  return Math.round(base);
}

function parseSalaryRangeFromQuery(text: string): SalaryRange | null {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }

  const amountPattern =
    "(?:\\u20b9|rs\\.?|inr)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|lakh|lakhs|crore|crores)?";

  const betweenExpression = new RegExp(
    `\\bbetween\\s+${amountPattern}\\s+and\\s+${amountPattern}`,
    "i"
  );
  const betweenMatch = normalized.match(betweenExpression);
  if (betweenMatch) {
    const first = parseNumericValue(betweenMatch[1] ?? "", betweenMatch[2]);
    const second = parseNumericValue(betweenMatch[3] ?? "", betweenMatch[4]);
    if (first !== null && second !== null) {
      return {
        min: Math.min(first, second),
        max: Math.max(first, second),
      };
    }
  }

  const rangeExpression = new RegExp(
    `${amountPattern}\\s*(?:-|to|and)\\s*${amountPattern}`,
    "i"
  );
  const rangeMatch = normalized.match(rangeExpression);
  if (rangeMatch) {
    const first = parseNumericValue(rangeMatch[1] ?? "", rangeMatch[2]);
    const second = parseNumericValue(rangeMatch[3] ?? "", rangeMatch[4]);
    if (first !== null && second !== null) {
      return {
        min: Math.min(first, second),
        max: Math.max(first, second),
      };
    }
  }

  const aroundExpression = new RegExp(
    `\\b(?:around|about|approx(?:\\.|imately)?|near)\\s+${amountPattern}`,
    "i"
  );
  const aroundMatch = normalized.match(aroundExpression);
  if (aroundMatch) {
    const amount = parseNumericValue(aroundMatch[1] ?? "", aroundMatch[2]);
    if (amount !== null) {
      const tolerance = Math.max(1_000, Math.round(amount * 0.2));
      return {
        min: Math.max(0, amount - tolerance),
        max: amount + tolerance,
      };
    }
  }

  const minExpression = new RegExp(
    `\\b(?:above|over|minimum|at\\s+least|more\\s+than|greater\\s+than)\\s+${amountPattern}`,
    "i"
  );
  const minMatch = normalized.match(minExpression);
  if (minMatch) {
    const min = parseNumericValue(minMatch[1] ?? "", minMatch[2]);
    if (min !== null) {
      return { min, max: null };
    }
  }

  const maxExpression = new RegExp(
    `\\b(?:below|under|maximum|upto|up\\s+to|less\\s+than)\\s+${amountPattern}`,
    "i"
  );
  const maxMatch = normalized.match(maxExpression);
  if (maxMatch) {
    const max = parseNumericValue(maxMatch[1] ?? "", maxMatch[2]);
    if (max !== null) {
      return { min: null, max };
    }
  }

  return null;
}

function isSalaryPresenceIntent(text: string) {
  const normalized = normalize(text);
  if (!normalized) {
    return false;
  }

  if (!/\b(salary|pay|stipend)\b/.test(normalized)) {
    return false;
  }

  if (parseSalaryRangeFromQuery(text)) {
    return false;
  }

  return /\b(has|have|with|where|mention|mentioned|provided|available|disclosed|listed|show|showing|any)\b/.test(
    normalized
  );
}

function parseSalaryRangeFromJobText(text: string): SalaryRange | null {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }

  const amountPattern =
    "(?:\\u20b9|rs\\.?|inr)?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|lakh|lakhs|crore|crores)?";

  const rangeExpression = new RegExp(
    `${amountPattern}\\s*(?:-|to|and)\\s*${amountPattern}`,
    "i"
  );
  const rangeMatch = normalized.match(rangeExpression);
  if (rangeMatch) {
    const first = parseNumericValue(rangeMatch[1] ?? "", rangeMatch[2]);
    const second = parseNumericValue(rangeMatch[3] ?? "", rangeMatch[4]);
    if (first !== null && second !== null) {
      return { min: Math.min(first, second), max: Math.max(first, second) };
    }
  }

  const singleExpression = new RegExp(amountPattern, "i");
  const singleMatch = normalized.match(singleExpression);
  if (singleMatch) {
    const amount = parseNumericValue(singleMatch[1] ?? "", singleMatch[2]);
    if (amount !== null) {
      return { min: amount, max: amount };
    }
  }

  return null;
}

function salaryOverlapsFilter(jobSalary: SalaryRange, filterSalary: SalaryRange) {
  const jobMin = jobSalary.min ?? jobSalary.max;
  const jobMax = jobSalary.max ?? jobSalary.min;
  const filterMin = filterSalary.min;
  const filterMax = filterSalary.max;

  if (jobMin === null || jobMax === null) {
    return false;
  }

  if (filterMin !== null && jobMax < filterMin) {
    return false;
  }
  if (filterMax !== null && jobMin > filterMax) {
    return false;
  }
  return true;
}

function extractQualifications(text: string): QualificationFilter[] {
  const matches: QualificationFilter[] = [];
  for (const entry of QUALIFICATION_PATTERNS) {
    if (entry.regex.test(text)) {
      matches.push(entry.id);
    }
  }
  return Array.from(new Set(matches));
}

function parseEmploymentType(text: string): EmploymentTypeFilter | undefined {
  if (/\bpart[\s-]?time\b/i.test(text)) {
    return "part-time";
  }
  if (/\bfull[\s-]?time\b/i.test(text)) {
    return "full-time";
  }
  if (/\b(contract|contractual|temporary)\b/i.test(text)) {
    return "contract";
  }
  if (/\b(intern|internship|trainee)\b/i.test(text)) {
    return "internship";
  }

  return undefined;
}

function parseSector(text: string): SectorFilter | undefined {
  if (/\b(government|govt|public\s+sector|psu)\b/i.test(text)) {
    return "government";
  }
  if (/\b(private|pvt|corporate|company)\b/i.test(text)) {
    return "private";
  }
  return undefined;
}

function parseLocation(text: string, knownLocations: string[]): string | undefined {
  const normalizedText = normalize(text);
  if (!normalizedText) {
    return undefined;
  }

  const knownLocationEntries = knownLocations
    .map((value) => ({ raw: value, normalized: normalize(value) }))
    .filter((entry) => entry.normalized.length > 0)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  for (const location of knownLocationEntries) {
    if (normalizedText.includes(location.normalized)) {
      return location.raw;
    }
  }

  const fallbackMatch = normalizedText.match(/\b(?:in|at|from)\s+([a-z][a-z\s]{1,40})\b/i);
  if (!fallbackMatch?.[1]) {
    return undefined;
  }

  const candidate = fallbackMatch[1]
    .replace(/\b(jobs?|job|available|only|please|show|me)\b/gi, " ")
    .trim();

  return candidate.length >= 2 ? candidate : undefined;
}

function extractKeywords(text: string): string[] {
  const normalizedText = normalize(text);
  if (!normalizedText) {
    return [];
  }

  const words = normalizedText.match(/[a-z]{3,}/g) ?? [];
  return toUniqueList(words.filter((word) => !WORD_STOPLIST.has(word)));
}

function shouldResetFilters(text: string) {
  return /\b(reset\s+filters|clear\s+filters|start\s+over|show\s+all\s+jobs|remove\s+all\s+filters)\b/i.test(
    text
  );
}

function parseFilterUpdate(text: string, knownLocations: string[]): ParsedFilterUpdate {
  const reset = shouldResetFilters(text);
  const salaryMentioned = /\b(salary|pay|stipend|\u20b9|rs\.?|inr|between|under|above)\b/i.test(text);
  const qualificationMentioned = /\b(qualification|10th|12th|class\s*10|class\s*12|graduate|diploma|iti|post\s*graduate|postgraduate|pg)\b/i.test(
    text
  );

  if (reset) {
    return {
      reset: true,
      salaryMentioned,
      salaryParsed: false,
      qualificationMentioned,
      qualificationParsed: false,
    };
  }

  const salary = parseSalaryRangeFromQuery(text);
  const salaryKnownOnly = isSalaryPresenceIntent(text);
  const qualifications = extractQualifications(text);
  const employmentType = parseEmploymentType(text);
  const sector = parseSector(text);
  const location = parseLocation(text, knownLocations);
  const keywords = extractKeywords(text);

  return {
    reset: false,
    ...(location ? { location } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(sector ? { sector } : {}),
    ...(salary
      ? {
          salaryMin: salary.min,
          salaryMax: salary.max,
        }
      : {}),
    ...(salaryKnownOnly ? { salaryKnownOnly: true } : {}),
    ...(qualifications.length > 0 ? { qualifications } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    salaryMentioned,
    salaryParsed: salary !== null || salaryKnownOnly,
    qualificationMentioned,
    qualificationParsed: qualifications.length > 0,
  };
}

function getInitialState(): JobsFilterState {
  return {
    location: null,
    employmentType: null,
    sector: null,
    salaryMin: null,
    salaryMax: null,
    salaryKnownOnly: false,
    qualifications: [],
    keywords: [],
  };
}

function mergeFilterState(state: JobsFilterState, update: ParsedFilterUpdate): JobsFilterState {
  if (update.reset) {
    return getInitialState();
  }

  return {
    location: update.location ?? state.location,
    employmentType: update.employmentType ?? state.employmentType,
    sector: update.sector ?? state.sector,
    salaryMin:
      update.salaryMin !== undefined ? update.salaryMin : state.salaryMin,
    salaryMax:
      update.salaryMax !== undefined ? update.salaryMax : state.salaryMax,
    salaryKnownOnly:
      update.salaryKnownOnly !== undefined
        ? update.salaryKnownOnly
        : state.salaryKnownOnly,
    qualifications: update.qualifications ?? state.qualifications,
    keywords: update.keywords?.length ? update.keywords : state.keywords,
  };
}

function formatCurrency(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function describeState(state: JobsFilterState) {
  const labels: string[] = [];

  if (state.qualifications.length > 0) {
    const readable = state.qualifications
      .map((item) => QUALIFICATION_PATTERNS.find((entry) => entry.id === item)?.label ?? item)
      .join(", ");
    labels.push(`qualification: ${readable}`);
  }

  if (state.salaryMin !== null || state.salaryMax !== null) {
    if (state.salaryMin !== null && state.salaryMax !== null) {
      labels.push(`salary between ${formatCurrency(state.salaryMin)} and ${formatCurrency(state.salaryMax)}`);
    } else if (state.salaryMin !== null) {
      labels.push(`salary at least ${formatCurrency(state.salaryMin)}`);
    } else if (state.salaryMax !== null) {
      labels.push(`salary up to ${formatCurrency(state.salaryMax)}`);
    }
  }

  if (state.salaryKnownOnly) {
    labels.push("salary mentioned");
  }

  if (state.employmentType) {
    labels.push(`type: ${state.employmentType}`);
  }

  if (state.sector) {
    labels.push(`${state.sector} jobs`);
  }

  if (state.location) {
    labels.push(`location: ${state.location}`);
  }

  if (state.keywords.length > 0) {
    labels.push(`keywords: ${state.keywords.join(", ")}`);
  }

  return labels;
}

function getJobHaystack(job: JobPostingRecord) {
  return normalize([
    job.title,
    job.company,
    job.location,
    job.sector,
    job.employmentType,
    job.content,
    ...job.tags,
  ].join(" "));
}

function getJobPrimaryHaystack(job: JobPostingRecord) {
  return normalize([
    job.title,
    job.company,
    job.location,
    job.sector,
    job.employmentType,
    ...job.tags,
  ].join(" "));
}

function matchesEmploymentType(haystack: string, employmentType: EmploymentTypeFilter) {
  if (employmentType === "part-time") {
    return /\bpart[\s-]?time\b/i.test(haystack);
  }
  if (employmentType === "full-time") {
    return /\bfull[\s-]?time\b/i.test(haystack);
  }
  if (employmentType === "contract") {
    return /\b(contract|contractual|temporary)\b/i.test(haystack);
  }
  return /\b(intern|internship|trainee)\b/i.test(haystack);
}

function matchesQualification(haystack: string, qualifications: QualificationFilter[]) {
  return qualifications.some((qualification) => {
    const pattern = QUALIFICATION_PATTERNS.find((entry) => entry.id === qualification);
    return pattern ? pattern.regex.test(haystack) : false;
  });
}

function resolveCanonicalSector(job: JobPostingRecord): JobSector {
  if (isJobSector((job as JobPostingRecord & { sector?: unknown }).sector)) {
    return job.sector;
  }

  return resolveJobSector({
    title: job.title,
    company: job.company,
    source: job.source,
    sourceUrl: job.sourceUrl,
    applicationLink: job.applicationLink,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
    description: job.content,
    pdfContent: job.pdfContent,
    tags: job.tags,
  });
}

function matchesSector(job: JobPostingRecord, sector: SectorFilter) {
  return resolveCanonicalSector(job) === sector;
}

function matchesKeywords(haystack: string, keywords: string[]) {
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const toKeywordRoot = (value: string) => {
    let root = normalize(value).replace(/[^a-z]/g, "");
    if (!root) {
      return "";
    }

    if (root.endsWith("ing") && root.length > 5) {
      root = root.slice(0, -3);
    } else if (root.endsWith("ers") && root.length > 5) {
      root = root.slice(0, -3);
    } else if (root.endsWith("er") && root.length > 4) {
      root = root.slice(0, -2);
    } else if (root.endsWith("es") && root.length > 4) {
      root = root.slice(0, -2);
    } else if (root.endsWith("s") && root.length > 3) {
      root = root.slice(0, -1);
    }

    if (root.endsWith("e") && root.length > 4) {
      root = root.slice(0, -1);
    }

    return root;
  };

  return keywords.every((keyword) => {
    if (haystack.includes(keyword)) {
      return true;
    }

    const root = toKeywordRoot(keyword);
    if (root.length < 3) {
      return false;
    }

    const rootPattern = new RegExp(`\\b${escapeRegExp(root)}[a-z]*\\b`, "i");
    return rootPattern.test(haystack);
  });
}

function matchesKeywordsWithPrecision({
  fullHaystack,
  primaryHaystack,
  keywords,
  requirePrimaryKeywordMatch,
}: {
  fullHaystack: string;
  primaryHaystack: string;
  keywords: string[];
  requirePrimaryKeywordMatch: boolean;
}) {
  if (!matchesKeywords(fullHaystack, keywords)) {
    return false;
  }

  if (!requirePrimaryKeywordMatch) {
    return true;
  }

  return matchesKeywords(primaryHaystack, keywords);
}

function matchesSalary(job: JobPostingRecord, state: JobsFilterState) {
  const jobSalary = parseSalaryRangeFromJobText(
    [job.title, job.salary ?? "", job.content, job.pdfContent ?? ""].join(" ")
  );

  if (state.salaryKnownOnly && !jobSalary) {
    return false;
  }

  if (state.salaryMin === null && state.salaryMax === null) {
    return true;
  }

  if (!jobSalary) {
    return false;
  }

  return salaryOverlapsFilter(jobSalary, {
    min: state.salaryMin,
    max: state.salaryMax,
  });
}

function applyFilters(jobs: JobPostingRecord[], state: JobsFilterState) {
  const hasActiveFilters =
    Boolean(state.location) ||
    Boolean(state.employmentType) ||
    Boolean(state.sector) ||
    state.salaryMin !== null ||
    state.salaryMax !== null ||
    state.salaryKnownOnly ||
    state.qualifications.length > 0 ||
    state.keywords.length > 0;

  if (!hasActiveFilters) {
    return { jobs, hasActiveFilters: false };
  }

  const hasOnlyKeywordFilters =
    state.keywords.length > 0 &&
    !state.location &&
    !state.employmentType &&
    !state.sector &&
    state.salaryMin === null &&
    state.salaryMax === null &&
    !state.salaryKnownOnly &&
    state.qualifications.length === 0;

  const filteredJobs = jobs.filter((job) => {
    const haystack = getJobHaystack(job);
    const primaryHaystack = getJobPrimaryHaystack(job);

    if (state.location) {
      const normalizedLocation = normalize(state.location);
      if (
        !normalize(job.location).includes(normalizedLocation) &&
        !haystack.includes(normalizedLocation)
      ) {
        return false;
      }
    }

    if (state.employmentType && !matchesEmploymentType(haystack, state.employmentType)) {
      return false;
    }

    if (state.sector && !matchesSector(job, state.sector)) {
      return false;
    }

    if (state.qualifications.length > 0 && !matchesQualification(haystack, state.qualifications)) {
      return false;
    }

    if (
      state.keywords.length > 0 &&
      !matchesKeywordsWithPrecision({
        fullHaystack: haystack,
        primaryHaystack,
        keywords: state.keywords,
        requirePrimaryKeywordMatch: hasOnlyKeywordFilters,
      })
    ) {
      return false;
    }

    if (!matchesSalary(job, state)) {
      return false;
    }

    return true;
  });

  return { jobs: filteredJobs, hasActiveFilters: true };
}

export function resolveJobsFilterConversation({
  jobs,
  priorUserMessages,
  latestUserMessage,
}: {
  jobs: JobPostingRecord[];
  priorUserMessages: string[];
  latestUserMessage: string;
}): JobsFilterResolution {
  const knownLocations = Array.from(
    new Set(jobs.map((job) => compactText(job.location)).filter(Boolean))
  );

  let state = getInitialState();
  const conversationMessages = [...priorUserMessages, latestUserMessage]
    .map((value) => value.trim())
    .filter(Boolean);

  for (const message of conversationMessages) {
    const parsedUpdate = parseFilterUpdate(message, knownLocations);
    const hasStructuredFilters =
      parsedUpdate.location !== undefined ||
      parsedUpdate.employmentType !== undefined ||
      parsedUpdate.sector !== undefined ||
      parsedUpdate.salaryMin !== undefined ||
      parsedUpdate.salaryMax !== undefined ||
      (parsedUpdate.qualifications?.length ?? 0) > 0;
    const hasUnresolvedStructuredSignal =
      (parsedUpdate.salaryMentioned && !parsedUpdate.salaryParsed) ||
      (parsedUpdate.qualificationMentioned && !parsedUpdate.qualificationParsed);

    if (hasUnresolvedStructuredSignal && !hasStructuredFilters) {
      continue;
    }
    state = mergeFilterState(state, parsedUpdate);
  }

  const latestUpdate = parseFilterUpdate(latestUserMessage, knownLocations);
  let clarification: string | null = null;

  if (!latestUpdate.reset && latestUpdate.salaryMentioned && !latestUpdate.salaryParsed) {
    clarification =
      "I can filter salary only when the range is explicit. Try a query like: salary between Rs 15000 and Rs 25000.";
  }

  if (
    !latestUpdate.reset &&
    latestUpdate.qualificationMentioned &&
    !latestUpdate.qualificationParsed
  ) {
    clarification =
      "I can filter qualification using explicit terms like 10th pass, 12th pass, graduate, diploma, or ITI.";
  }

  const { jobs: filteredJobs, hasActiveFilters } = applyFilters(jobs, state);
  const filterLabels = describeState(state);

  return {
    state,
    filteredJobs,
    hasActiveFilters,
    summary:
      filterLabels.length > 0
        ? filterLabels.join("; ")
        : "all available jobs",
    clarification,
  };
}
