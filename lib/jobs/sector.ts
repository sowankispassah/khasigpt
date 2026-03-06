export type JobSector = "government" | "private" | "unknown";
export type JobType = Exclude<JobSector, "unknown">;

type ResolveJobSectorInput = {
  title?: string | null;
  company?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  applicationLink?: string | null;
  pdfSourceUrl?: string | null;
  pdfCachedUrl?: string | null;
  description?: string | null;
  pdfContent?: string | null;
  tags?: readonly string[] | null;
};

const GOVERNMENT_ENTITY_PATTERNS = [
  /\bgovernment\b/i,
  /\bgovt\b/i,
  /\bministry\b/i,
  /\bdepartment\b/i,
  /\bpublic service commission\b/i,
  /\bcommission\b/i,
  /\bmunicipal\b/i,
  /\bdistrict administration\b/i,
  /\bpanchayat\b/i,
  /\bstate government\b/i,
  /\bcentral government\b/i,
  /\bpublic sector\b/i,
  /\bpsu\b/i,
] as const;

const GOVERNMENT_CONTENT_PATTERNS = [
  /\bgovernment\b/i,
  /\bgovt\b/i,
  /\bgovernment recruitment\b/i,
  /\bgovt recruitment\b/i,
  /\bgovernment job\b/i,
  /\bpublic sector\b/i,
  /\bpsu\b/i,
] as const;

const PRIVATE_STRONG_PATTERNS = [
  /\bpvt\b/i,
  /\bpvt\.?\s*ltd\b/i,
  /\bprivate limited\b/i,
  /\bllp\b/i,
  /\blimited liability partnership\b/i,
  /\binc\b/i,
  /\bcorp\b/i,
  /\bstartup\b/i,
] as const;

const PRIVATE_WEAK_PATTERNS = [
  /\btechnolog(?:y|ies)\b/i,
  /\bsolutions?\b/i,
  /\bservices?\b/i,
  /\bprivate\b/i,
  /\bcorporate\b/i,
] as const;

const PRIVATE_CONTENT_PATTERNS = [
  /\bprivate company\b/i,
  /\bprivate sector\b/i,
  /\bcorporate\b/i,
  /\bstartup\b/i,
] as const;

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? compactText(value).toLowerCase() : "";
}

function joinText(values: Array<string | null | undefined>) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(" ");
}

function matchesAny(text: string, patterns: readonly RegExp[]) {
  if (!text) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(text));
}

function normalizeTags(tags: readonly string[] | null | undefined) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
}

function extractHost(rawUrl: string | null | undefined) {
  const normalizedUrl = normalizeText(rawUrl);
  if (!normalizedUrl) {
    return "";
  }

  try {
    return new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isGovernmentHost(hostname: string) {
  if (!hostname) {
    return false;
  }

  return (
    hostname === "gov.in" ||
    hostname.endsWith(".gov.in") ||
    hostname === "nic.in" ||
    hostname.endsWith(".nic.in") ||
    hostname === "gov" ||
    hostname.endsWith(".gov") ||
    hostname.includes(".gov.") ||
    hostname.includes(".nic.")
  );
}

export function isJobSector(value: unknown): value is JobSector {
  return value === "government" || value === "private" || value === "unknown";
}

export function isJobType(value: unknown): value is JobType {
  return value === "government" || value === "private";
}

export function resolveJobType(sector: JobSector): JobType {
  return sector === "government" ? "government" : "private";
}

export function getJobSectorLabel(sector: JobSector) {
  if (sector === "government") {
    return "Government";
  }
  return "Private";
}

export function getJobTypeLabel(type: string) {
  return type.trim().toLowerCase() === "government" ? "Government" : "Private";
}

export function resolveJobSector(input: ResolveJobSectorInput): JobSector {
  const entityText = joinText([
    input.title,
    input.company,
    input.source,
    ...(normalizeTags(input.tags) as string[]),
  ]);
  const contentText = joinText([input.description, input.pdfContent]);
  const sourceHost = extractHost(input.sourceUrl);
  const applicationHost = extractHost(input.applicationLink);
  const pdfSourceHost = extractHost(input.pdfSourceUrl);
  const pdfCachedHost = extractHost(input.pdfCachedUrl);
  const hasGovernmentDomain =
    isGovernmentHost(sourceHost) ||
    isGovernmentHost(applicationHost) ||
    isGovernmentHost(pdfSourceHost) ||
    isGovernmentHost(pdfCachedHost);

  let governmentScore = 0;
  let privateScore = 0;

  if (hasGovernmentDomain) {
    governmentScore += 8;
  }

  if (matchesAny(entityText, GOVERNMENT_ENTITY_PATTERNS)) {
    governmentScore += 4;
  }
  if (matchesAny(contentText, GOVERNMENT_CONTENT_PATTERNS)) {
    governmentScore += 2;
  }

  if (matchesAny(entityText, PRIVATE_STRONG_PATTERNS)) {
    privateScore += 4;
  } else if (matchesAny(entityText, PRIVATE_WEAK_PATTERNS)) {
    privateScore += 2;
  }

  if (matchesAny(contentText, PRIVATE_CONTENT_PATTERNS)) {
    privateScore += 1;
  }

  if (hasGovernmentDomain && governmentScore >= privateScore - 1) {
    return "government";
  }

  if (governmentScore === 0 && privateScore === 0) {
    return "unknown";
  }

  if (governmentScore > privateScore) {
    return governmentScore - privateScore >= 2 ? "government" : "unknown";
  }

  if (privateScore > governmentScore) {
    return privateScore - governmentScore >= 2 ? "private" : "unknown";
  }

  return "unknown";
}
