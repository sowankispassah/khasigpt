export type LocationEntry = {
  role: string;
  location: string;
};

export type ResolvedLocationInfo = {
  summary: string;
  entries: LocationEntry[];
};

export const DEFAULT_JOB_LOCATION = "Meghalaya";

const UNKNOWN_LOCATION_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "not available",
  "not disclosed",
]);

const NON_LOCATION_SECTION_LABELS = [
  "essential qualification",
  "qualification",
  "educational qualification",
  "eligibility",
  "experience",
  "salary",
  "pay",
  "remuneration",
  "emoluments",
  "application fee",
  "last date",
  "deadline",
  "notification date",
  "how to apply",
  "selection process",
  "instructions",
  "terms of reference",
  "no of vacancy",
  "vacancy",
  "posted on",
  "date",
  "source",
  "company",
];

const LOCATION_LABELS = [
  "place of posting",
  "place posting",
  "posting location",
  "posting place",
  "location",
  "job location",
  "place of work",
  "work location",
  "duty station",
  "station",
];

const LOCATION_HEADER_LABELS = [
  "place of posting",
  "location",
  "posting location",
  "place posting",
  "work location",
];

const LOCATION_ALIASES = [
  { label: "All Districts", specificity: 4, patterns: [/\ball districts?\b/i] },
  { label: "Shillong", specificity: 3, patterns: [/\bshillong\b/i] },
  { label: "Tura", specificity: 3, patterns: [/\btura\b/i] },
  { label: "Jowai", specificity: 3, patterns: [/\bjowai\b/i] },
  { label: "Nongpoh", specificity: 3, patterns: [/\bnongpoh\b/i] },
  { label: "Williamnagar", specificity: 3, patterns: [/\bwilliamnagar\b/i] },
  { label: "Baghmara", specificity: 3, patterns: [/\bbaghmara\b/i] },
  { label: "Nongstoin", specificity: 3, patterns: [/\bnongstoin\b/i] },
  { label: "Mawkyrwat", specificity: 3, patterns: [/\bmawkyrwat\b/i] },
  { label: "Khliehriat", specificity: 3, patterns: [/\bkhliehriat\b/i] },
  { label: "Ampati", specificity: 3, patterns: [/\bampati\b/i] },
  { label: "Resubelpara", specificity: 3, patterns: [/\bresubelpara\b/i] },
  { label: "East Khasi Hills", specificity: 2, patterns: [/\beast khasi hills\b/i] },
  { label: "West Khasi Hills", specificity: 2, patterns: [/\bwest khasi hills\b/i] },
  { label: "Eastern West Khasi Hills", specificity: 2, patterns: [/\beastern west khasi hills\b/i] },
  { label: "South West Khasi Hills", specificity: 2, patterns: [/\bsouth west khasi hills\b/i] },
  { label: "East Jaintia Hills", specificity: 2, patterns: [/\beast jaintia hills\b/i] },
  { label: "West Jaintia Hills", specificity: 2, patterns: [/\bwest jaintia hills\b/i] },
  { label: "Ri Bhoi", specificity: 2, patterns: [/\bri bhoi\b/i] },
  { label: "East Garo Hills", specificity: 2, patterns: [/\beast garo hills\b/i] },
  { label: "West Garo Hills", specificity: 2, patterns: [/\bwest garo hills\b/i] },
  { label: "South Garo Hills", specificity: 2, patterns: [/\bsouth garo hills\b/i] },
  { label: "South West Garo Hills", specificity: 2, patterns: [/\bsouth west garo hills\b/i] },
  { label: "North Garo Hills", specificity: 2, patterns: [/\bnorth garo hills\b/i] },
  { label: "Meghalaya", specificity: 1, patterns: [/\bmeghalaya\b/i] },
] as const;

const ESCAPED_NON_LOCATION_SECTION_LABELS = NON_LOCATION_SECTION_LABELS.map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("|");

const ESCAPED_LOCATION_HEADER_LABELS = LOCATION_HEADER_LABELS.map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("|");

const ROLE_HINT_PATTERN =
  /\b(manager|assistant|associate|coordinator|fellow|administrator|officer|engineer|analyst|specialist|consultant|teacher|tutor|nurse|faculty|lecturer|driver|operator|accountant|executive|staff|clerk|director|head|lead|programme|program|project|field|technology|innovation|monitoring|evaluation)\b/i;

const NON_ROLE_PREFIX_PATTERN =
  /^(?:for|to|the|last|interested|office|current office address|advertisement|notification|general manager|sd|shillong)\b/i;

const ROLE_ROW_PATTERN = /(?:^|\s)(\d+(?:\.\d+){0,2})\s+([A-Z][A-Za-z0-9/&(),+'.\- ]{2,180}?)(?=\s+(?:Essential|Educational|Qualifications?|Experience|Requirement(?:s)?(?:\s+and\s+Skills)?|No\.?\s*of\s*Vacancy|Place\s+of\s+Posting|Monthly\s+(?:Emolument|Remuneration|Salary|Pay)|Remuneration|Emoluments?|Pay|Salary|Rs\.?|INR|All\s+Districts|Interested|For\s+applying|To\s+apply|Last\s+date|$))/g;

const TABLE_SECTION_END_PATTERN =
  /--\s*\d+\s*of\s*\d+\s*--|\b(?:How to Apply|For applying|To apply|Age Limit|Duration of Contract|Selection Process|General Information|Last date|Interested and eligible candidates)\b/i;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return normalizeWhitespace(
    value
      .replace(/\r\n/g, "\n")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/[*_`#>|~]/g, " ")
  );
}

function trimLocationPunctuation(value: string) {
  let normalized = value.replace(/^[\s:;,.!?\-\u2013]+/, "").trim();
  while (/[;,.!?]$/.test(normalized)) {
    normalized = normalized.slice(0, -1).trim();
  }
  return normalized;
}

function cleanRoleTitle(value: string) {
  return normalizeWhitespace(value)
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[;,.!?:]+$/g, "")
    .trim();
}

function isLikelyRoleTitle(value: string) {
  const normalized = cleanRoleTitle(value);
  if (!normalized || normalized.length < 3 || normalized.length > 180) {
    return false;
  }
  if (NON_ROLE_PREFIX_PATTERN.test(normalized)) {
    return false;
  }
  return ROLE_HINT_PATTERN.test(normalized);
}

function canonicalizeLocationValue(value: string | null | undefined) {
  const normalized = trimLocationPunctuation(normalizeSearchText(value));
  if (!normalized) {
    return null;
  }

  if (UNKNOWN_LOCATION_VALUES.has(normalized.toLowerCase())) {
    return null;
  }

  for (const alias of LOCATION_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(normalized))) {
      return alias.label;
    }
  }

  return null;
}

function summarizeLocations(locations: string[]) {
  if (locations.length === 0) {
    return DEFAULT_JOB_LOCATION;
  }

  const deduped = Array.from(new Set(locations));
  if (deduped.includes("All Districts")) {
    return "All Districts";
  }
  if (deduped.length === 1) {
    return deduped[0];
  }
  if (deduped.length === 2) {
    return `${deduped[0]}, ${deduped[1]}`;
  }
  return `${deduped[0]}, ${deduped[1]}, and ${deduped.length - 2} more`;
}

function chooseMostSpecificLocation(locations: string[]) {
  const deduped = Array.from(new Set(locations));
  if (deduped.includes("All Districts")) {
    return "All Districts";
  }

  let best: { label: string; specificity: number } | null = null;
  for (const location of deduped) {
    const match = LOCATION_ALIASES.find((alias) => alias.label === location);
    const specificity = match?.specificity ?? 0;
    if (!best || specificity > best.specificity) {
      best = { label: location, specificity };
    }
  }

  return best?.label ?? DEFAULT_JOB_LOCATION;
}

function dedupeLocationEntries(entries: LocationEntry[]) {
  const deduped = new Map<string, LocationEntry>();
  for (const entry of entries) {
    const role = cleanRoleTitle(entry.role);
    const location = canonicalizeLocationValue(entry.location);
    if (!role || !location || !isLikelyRoleTitle(role)) {
      continue;
    }
    deduped.set(`${role.toLowerCase()}::${location.toLowerCase()}`, {
      role,
      location,
    });
  }
  return Array.from(deduped.values());
}

function findLocationMatches(text: string) {
  const matches: Array<{ index: number; location: string }> = [];

  for (const alias of LOCATION_ALIASES) {
    for (const pattern of alias.patterns) {
      const match = pattern.exec(text);
      if (match && typeof match.index === "number") {
        matches.push({
          index: match.index,
          location: alias.label,
        });
      }
    }
  }

  return matches.sort((left, right) => left.index - right.index);
}

function extractLocationByLabel(text: string) {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return null;
  }

  for (const label of LOCATION_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `(?:${escaped})\\s*[:\\-]?\\s*([\\s\\S]{1,220})`,
      "i"
    );
    const match = normalized.match(expression);
    if (!match?.[1]) {
      continue;
    }

    const candidate = trimLocationPunctuation(
      match[1]
        .split(
          new RegExp(
            `\\s+(?=(?:${ESCAPED_NON_LOCATION_SECTION_LABELS})\\b\\s*:?)`,
            "i"
          )
        )[0] ?? ""
    );
    const resolved = canonicalizeLocationValue(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function splitRoleVariants(role: string) {
  const separators = [/\s+and\s+/i, /\s*&\s*/i, /\s*,\s*/];

  for (const separator of separators) {
    const parts = role
      .split(separator)
      .map((part) => cleanRoleTitle(part))
      .filter(Boolean);
    if (parts.length > 1 && parts.every((part) => isLikelyRoleTitle(part))) {
      return parts;
    }
  }

  return [role];
}

function resolveRowChunkEnd(text: string, rowIndex: number, nextRowIndex: number | null) {
  let endIndex = Math.min(text.length, rowIndex + 3_000);
  if (typeof nextRowIndex === "number") {
    endIndex = Math.min(endIndex, nextRowIndex);
  }

  const chunk = text.slice(rowIndex, endIndex);
  const boundary = chunk.match(TABLE_SECTION_END_PATTERN);
  if (boundary && typeof boundary.index === "number" && boundary.index > 0) {
    endIndex = Math.min(endIndex, rowIndex + boundary.index);
  }

  return endIndex;
}

function extractLocationFromRowChunk(chunk: string) {
  const normalized = normalizeSearchText(chunk);
  if (!normalized) {
    return null;
  }

  const labelled = extractLocationByLabel(normalized);
  if (labelled) {
    return labelled;
  }

  const locationMatches = findLocationMatches(normalized);
  if (locationMatches.length === 0) {
    return null;
  }

  const salaryLikeMatch = normalized.search(/\b(?:rs\.?|inr|\u20b9|salary|pay|remuneration|emolument)\b/i);
  const beforeSalaryMatches =
    salaryLikeMatch >= 0
      ? locationMatches.filter((match) => match.index < salaryLikeMatch)
      : locationMatches;

  if (beforeSalaryMatches.length > 0) {
    return beforeSalaryMatches[beforeSalaryMatches.length - 1]?.location ?? null;
  }

  return locationMatches[0]?.location ?? null;
}

function extractRoleRows(text: string) {
  if (!new RegExp(`\\b(?:${ESCAPED_LOCATION_HEADER_LABELS})\\b`, "i").test(text)) {
    return [];
  }

  const rows: Array<{ index: number; role: string }> = [];
  for (const match of text.matchAll(ROLE_ROW_PATTERN)) {
    const role = cleanRoleTitle(match[2] ?? "");
    if (!isLikelyRoleTitle(role)) {
      continue;
    }

    rows.push({
      index: match.index ?? 0,
      role,
    });
  }

  return rows;
}

function extractLocationEntries(text: string | null | undefined) {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return [];
  }

  const rows = extractRoleRows(normalized);
  if (rows.length === 0) {
    return [];
  }

  const entries: LocationEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nextRow = rows[index + 1];
    const chunkEnd = resolveRowChunkEnd(normalized, row.index, nextRow?.index ?? null);
    const chunk = normalized.slice(row.index, chunkEnd);
    const location = extractLocationFromRowChunk(chunk);
    if (!location) {
      continue;
    }

    const roleVariants = splitRoleVariants(row.role);
    for (const roleVariant of roleVariants) {
      entries.push({
        role: roleVariant,
        location,
      });
    }
  }

  return dedupeLocationEntries(entries);
}

function resolveTextLocationInfo(text: string | null | undefined): ResolvedLocationInfo {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return {
      summary: DEFAULT_JOB_LOCATION,
      entries: [],
    };
  }

  const entries = extractLocationEntries(normalized);
  if (entries.length > 0) {
    return {
      summary: summarizeLocations(entries.map((entry) => entry.location)),
      entries,
    };
  }

  const explicit = extractLocationByLabel(normalized);
  if (explicit) {
    return {
      summary: explicit,
      entries: [],
    };
  }

  const locationMatches = findLocationMatches(normalized);
  if (locationMatches.length > 0) {
    return {
      summary: chooseMostSpecificLocation(locationMatches.map((match) => match.location)),
      entries: [],
    };
  }

  return {
    summary: DEFAULT_JOB_LOCATION,
    entries: [],
  };
}

export function resolveJobLocationInfo({
  location,
  content,
  pdfContent,
}: {
  location?: string | null;
  content?: string | null;
  pdfContent?: string | null;
}): ResolvedLocationInfo {
  for (const candidate of [pdfContent, content]) {
    const resolved = resolveTextLocationInfo(candidate);
    if (resolved.summary !== DEFAULT_JOB_LOCATION || resolved.entries.length > 0) {
      return resolved;
    }
  }

  const storedLocation = canonicalizeLocationValue(location);
  if (storedLocation) {
    return {
      summary: storedLocation,
      entries: [],
    };
  }

  return {
    summary: DEFAULT_JOB_LOCATION,
    entries: [],
  };
}

export function resolveJobLocation(args: {
  location?: string | null;
  content?: string | null;
  pdfContent?: string | null;
}) {
  return resolveJobLocationInfo(args).summary;
}
