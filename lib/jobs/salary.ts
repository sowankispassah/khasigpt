export type CompensationEntry = {
  role: string;
  salary: string;
};

export type ResolvedSalaryInfo = {
  summary: string;
  entries: CompensationEntry[];
};

export const NO_SALARY_LABEL = "NA";

const SALARY_LABELS = [
  "salary",
  "pay scale",
  "pay band",
  "pay level",
  "pay matrix",
  "pay package",
  "remuneration",
  "monthly remuneration",
  "consolidated remuneration",
  "emoluments",
  "monthly salary",
  "monthly pay",
  "monthly emolument",
  "consolidated pay",
  "stipend",
  "honorarium",
  "compensation",
  "compensation package",
  "cost to company",
  "ctc",
  "wage",
  "wages",
] as const;

const TABLE_SALARY_HEADERS = [
  "salary",
  "pay",
  "remuneration",
  "monthly emolument",
  "monthly remuneration",
  "monthly salary",
  "monthly pay",
  "emoluments",
] as const;

const NON_SALARY_SECTION_LABELS = [
  "essential qualification",
  "qualification",
  "educational qualification",
  "eligibility",
  "experience",
  "age limit",
  "selection process",
  "application fee",
  "exam fee",
  "registration fee",
  "how to apply",
  "application procedure",
  "instructions",
  "important instructions",
  "important dates",
  "last date",
  "last date of receipt",
  "application deadline",
  "submission deadline",
  "closing date",
  "apply before",
  "deadline",
  "notification date",
  "date of notification",
  "advertisement date",
  "date of publication",
  "published on",
  "issue date",
  "location",
  "company",
  "source",
  "place of posting",
  "no of vacancy",
  "terms of reference",
] as const;

const ROLE_HINT_PATTERN =
  /\b(manager|assistant|associate|coordinator|fellow|administrator|officer|engineer|analyst|specialist|consultant|teacher|tutor|nurse|faculty|lecturer|driver|operator|accountant|executive|staff|clerk|director|head|lead|programme|program|project|field|technology|innovation|monitoring|evaluation)\b/i;

const NON_ROLE_PREFIX_PATTERN =
  /^(?:for|to|the|last|interested|office|current office address|advertisement|notification|general manager|sd)/i;

const ESCAPED_SALARY_LABELS = SALARY_LABELS.map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("|");

const ESCAPED_TABLE_SALARY_HEADERS = TABLE_SALARY_HEADERS.map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("|");

const ESCAPED_NON_SALARY_SECTION_LABELS = NON_SALARY_SECTION_LABELS.map((label) =>
  label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
).join("|");

const QUALITATIVE_SALARY_PATTERN =
  /\b(as per(?: the)?(?: [a-z]+){0,4} (?:norms?|rules?)|negotiable)\b/i;

const PAY_LEVEL_PATTERN =
  /^(?:pay\s*(?:scale|matrix|level)|level[-\s]*\d+[a-z]?|pb-\d+|grade pay)\b/i;

const SALARY_AMOUNT_PATTERN =
  /(?:\u20b9|rs\.?|inr)\s?\d[\d,]*(?:\s*\/-)?(?:\s*(?:-|to|\u2013)\s*(?:\u20b9|rs\.?|inr)?\s?\d[\d,]*(?:\s*\/-)?)?(?:\s*(?:\([^)]{1,80}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances|including allowances|\+\s*[A-Z]{2,8}|plus\s+[A-Z]{2,8}))*/i;

const SALARY_AMOUNT_GLOBAL_PATTERN = new RegExp(SALARY_AMOUNT_PATTERN.source, "ig");

const SHORT_NUMERIC_SALARY_PATTERN =
  /^\d[\d,]*(?:\s*\/-)?(?:\s*(?:-|to|\u2013)\s*\d[\d,]*(?:\s*\/-)?)?(?:\s*(?:\([^)]{1,80}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances|\+\s*[A-Z]{2,8}|plus\s+[A-Z]{2,8}))*$/i;

const SALARY_TAIL_PATTERN =
  /^(?:\s*(?:\([^)]{1,80}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances|including allowances|\+\s*[A-Z]{2,8}|plus\s+[A-Z]{2,8}))+/i;

const LABELLED_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\s*[:\\-]?\\s*([\\s\\S]{1,220})`,
  "ig"
);

const TABLE_HEADER_SALARY_PATTERN = new RegExp(
  `\\b(?:${ESCAPED_TABLE_SALARY_HEADERS})\\b[\\s\\S]{0,1500}?(${SALARY_AMOUNT_PATTERN.source})`,
  "i"
);

const TABLE_SALARY_CONTEXT_PATTERN = new RegExp(
  `\\b(?:${ESCAPED_TABLE_SALARY_HEADERS})\\b`,
  "i"
);

const CONTEXTUAL_QUALITATIVE_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\b[^.!?\\n\\r]{0,60}?(${QUALITATIVE_SALARY_PATTERN.source})`,
  "i"
);

const CONTEXTUAL_PREFIX_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\b[^.!?\\n\\r]{0,120}?(${SALARY_AMOUNT_PATTERN.source})`,
  "i"
);

const CONTEXTUAL_SUFFIX_SALARY_PATTERN = new RegExp(
  `(${SALARY_AMOUNT_PATTERN.source})[^.!?\\n\\r]{0,80}\\b(?:per month|monthly|per annum|annum|lpa|lakhs? p\\.?a\\.?|consolidated|salary|stipend|honorarium|allowances|hra)\\b`,
  "i"
);

const ROLE_ROW_PATTERN = new RegExp(
  String.raw`(?:^|\s)(\d+(?:\.\d+){0,2})\s+([A-Z][A-Za-z0-9/&(),+'.\- ]{2,180}?)(?=\s+(?:Essential|Educational|Qualifications?|Experience|Requirement(?:s)?(?:\s+and\s+Skills)?|No\.?\s*of\s*Vacancy|Place\s+of\s+Posting|Monthly\s+(?:Emolument|Remuneration|Salary|Pay)|Remuneration|Emoluments?|Pay|Salary|Rs\.?|INR|All\s+Districts|Interested|For\s+applying|To\s+apply|Last\s+date|$))`,
  "g"
);

const NON_SALARY_PREFIX_PATTERN =
  /^(?:application fee|exam fee|registration fee|fee|age limit|last date|deadline|notification date|qualification|essential qualification|eligibility|experience)\b/i;

const ROW_SECTION_END_PATTERN =
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

function trimSalaryPunctuation(value: string) {
  let normalized = value.replace(/^[\s:;,.!?\-\u2013]+/, "").trim();

  while (/[;,.!?]$/.test(normalized)) {
    normalized = normalized.slice(0, -1).trim();
  }

  if (/[-\u2013]$/.test(normalized) && !/\/[-\u2013]$/.test(normalized)) {
    normalized = normalized.slice(0, -1).trim();
  }

  return normalized;
}

function truncateAtBoundary(value: string) {
  const boundaries = [
    /\s+\*\*[^*]{2,80}\*\*\s*:/i,
    new RegExp(
      `\\s+(?=(?:${ESCAPED_NON_SALARY_SECTION_LABELS})\\b\\s*:)`,
      "i"
    ),
    /\s+(?=[A-Z][A-Z /()&-]{4,40}\s*:)/,
  ];

  let endIndex = value.length;
  for (const pattern of boundaries) {
    const match = pattern.exec(value);
    if (match && match.index < endIndex) {
      endIndex = match.index;
    }
  }

  return value.slice(0, endIndex).trim();
}

function cleanSalaryCandidate(value: string) {
  const normalized = truncateAtBoundary(trimSalaryPunctuation(normalizeSearchText(value)));
  return trimSalaryPunctuation(normalized);
}

function cleanRoleTitle(value: string) {
  let normalized = normalizeWhitespace(value)
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[;,.!?:]+$/g, "")
    .trim();

  normalized = normalized.replace(
    /\s+(?:Monthly\s+(?:Emolument|Remuneration|Salary|Pay)|Remuneration|Emoluments?|Pay|Salary)$/i,
    ""
  );

  return normalized;
}

function isLikelyRoleTitle(value: string) {
  const normalized = cleanRoleTitle(value);
  if (!normalized || normalized.length < 3 || normalized.length > 160) {
    return false;
  }
  if (NON_ROLE_PREFIX_PATTERN.test(normalized)) {
    return false;
  }
  return ROLE_HINT_PATTERN.test(normalized);
}

function extractQualitativeSalary(value: string) {
  const match = value.match(QUALITATIVE_SALARY_PATTERN);
  return match?.[1] ? trimSalaryPunctuation(normalizeWhitespace(match[1])) : null;
}

function appendSalaryTail(value: string, baseSalary: string) {
  const index = value.indexOf(baseSalary);
  if (index < 0) {
    return baseSalary;
  }

  const tail = value.slice(index + baseSalary.length);
  const tailMatch = tail.match(SALARY_TAIL_PATTERN);
  if (!tailMatch?.[0]) {
    return baseSalary;
  }

  return trimSalaryPunctuation(
    normalizeWhitespace(`${baseSalary}${tailMatch[0]}`)
  );
}

function hasSalaryOnlyTail(value: string, amount: string) {
  if (!value.startsWith(amount)) {
    return false;
  }

  const tail = trimSalaryPunctuation(value.slice(amount.length));
  if (!tail) {
    return false;
  }

  return /^(?:\([^)]{1,80}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances|including allowances|\+\s*[A-Z]{2,8}|plus\s+[A-Z]{2,8}|\s)+$/i.test(
    tail
  );
}

function extractSalaryFromRowChunk(value: string) {
  const normalized = trimSalaryPunctuation(normalizeSearchText(value));
  if (!normalized) {
    return [];
  }

  SALARY_AMOUNT_GLOBAL_PATTERN.lastIndex = 0;
  const salaryValues = Array.from(normalized.matchAll(SALARY_AMOUNT_GLOBAL_PATTERN)).map(
    (match) =>
      appendSalaryTail(
        normalized,
        trimSalaryPunctuation(normalizeWhitespace(match[0]))
      )
  );
  if (salaryValues.length > 0) {
    return salaryValues;
  }

  const qualitative = extractQualitativeSalary(normalized);
  return qualitative ? [qualitative] : [];
}

function splitRoleVariants(role: string, expectedCount: number) {
  if (expectedCount <= 1) {
    return [role];
  }

  const separators = [/\s+and\s+/i, /\s*&\s*/i, /\s*,\s*/];

  for (const separator of separators) {
    const parts = role
      .split(separator)
      .map((part) => cleanRoleTitle(part))
      .filter(Boolean);

    if (parts.length < 2) {
      continue;
    }

    if (!parts.every((part) => isLikelyRoleTitle(part))) {
      continue;
    }

    if (parts.length === expectedCount) {
      return parts;
    }
  }

  return [role];
}

function extractShortSalary(value: string) {
  const cleaned = cleanSalaryCandidate(value);
  if (!cleaned) {
    return null;
  }

  if (PAY_LEVEL_PATTERN.test(cleaned) && SALARY_AMOUNT_PATTERN.test(cleaned)) {
    return cleaned;
  }

  const amountMatch = cleaned.match(SALARY_AMOUNT_PATTERN);
  if (amountMatch?.[0]) {
    const amount = appendSalaryTail(
      cleaned,
      trimSalaryPunctuation(normalizeWhitespace(amountMatch[0]))
    );
    if (hasSalaryOnlyTail(cleaned, amount)) {
      return cleaned;
    }
    return amount;
  }

  if (SHORT_NUMERIC_SALARY_PATTERN.test(cleaned)) {
    return cleaned;
  }

  const qualitative = extractQualitativeSalary(cleaned);
  if (qualitative) {
    return qualitative;
  }

  if (
    cleaned.length <= 60 &&
    /\b(?:consolidated pay|stipend|honorarium|fixed pay)\b/i.test(cleaned)
  ) {
    return cleaned;
  }

  return null;
}

function looksLikeStandaloneSalarySnippet(value: string) {
  const cleaned = cleanSalaryCandidate(value);
  if (!cleaned || NON_SALARY_PREFIX_PATTERN.test(cleaned)) {
    return false;
  }

  if (PAY_LEVEL_PATTERN.test(cleaned)) {
    return true;
  }

  if (new RegExp(`^(?:${ESCAPED_SALARY_LABELS})\\b`, "i").test(cleaned)) {
    return true;
  }

  if (extractQualitativeSalary(cleaned)) {
    return true;
  }

  if (SHORT_NUMERIC_SALARY_PATTERN.test(cleaned)) {
    return true;
  }

  const amountMatch = cleaned.match(SALARY_AMOUNT_PATTERN);
  if (!amountMatch?.[0]) {
    return false;
  }

  return (
    amountMatch.index === 0 ||
    /\b(?:per month|monthly|per annum|annum|stipend|honorarium|consolidated|hra)\b/i.test(
      cleaned
    )
  );
}

function extractSingleSalaryText(text: string | null | undefined) {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 140 && looksLikeStandaloneSalarySnippet(normalized)) {
    const shortSalary = extractShortSalary(normalized);
    if (shortSalary) {
      return shortSalary;
    }
  }

  LABELLED_SALARY_PATTERN.lastIndex = 0;
  for (const match of normalized.matchAll(LABELLED_SALARY_PATTERN)) {
    const candidate = match[1];
    if (!candidate) {
      continue;
    }

    const extracted = extractShortSalary(candidate);
    if (extracted) {
      return extracted;
    }
  }

  const tableHeaderMatch = normalized.match(TABLE_HEADER_SALARY_PATTERN);
  if (tableHeaderMatch?.[1]) {
    return appendSalaryTail(
      normalized,
      trimSalaryPunctuation(normalizeWhitespace(tableHeaderMatch[1]))
    );
  }

  const contextualQualitative = normalized.match(CONTEXTUAL_QUALITATIVE_SALARY_PATTERN);
  if (contextualQualitative?.[1]) {
    return trimSalaryPunctuation(normalizeWhitespace(contextualQualitative[1]));
  }

  const contextualPrefix = normalized.match(CONTEXTUAL_PREFIX_SALARY_PATTERN);
  if (contextualPrefix?.[1]) {
    return appendSalaryTail(
      normalized,
      trimSalaryPunctuation(normalizeWhitespace(contextualPrefix[1]))
    );
  }

  const contextualSuffix = normalized.match(CONTEXTUAL_SUFFIX_SALARY_PATTERN);
  if (contextualSuffix?.[1]) {
    return appendSalaryTail(
      normalized,
      trimSalaryPunctuation(normalizeWhitespace(contextualSuffix[1]))
    );
  }

  return null;
}

function dedupeCompensationEntries(entries: CompensationEntry[]) {
  const deduped = new Map<string, CompensationEntry>();
  for (const entry of entries) {
    const role = cleanRoleTitle(entry.role);
    const salary = trimSalaryPunctuation(normalizeWhitespace(entry.salary));
    if (!isLikelyRoleTitle(role) || !salary) {
      continue;
    }
    const key = `${role.toLowerCase()}::${salary.toLowerCase()}`;
    deduped.set(key, { role, salary });
  }
  return Array.from(deduped.values());
}

function resolveRowChunkEnd(text: string, rowIndex: number, nextRowIndex: number | null) {
  let endIndex = Math.min(text.length, rowIndex + 3_000);

  if (typeof nextRowIndex === "number") {
    endIndex = Math.min(endIndex, nextRowIndex);
  }

  const sectionChunk = text.slice(rowIndex, endIndex);
  const sectionBoundary = sectionChunk.match(ROW_SECTION_END_PATTERN);
  if (sectionBoundary && typeof sectionBoundary.index === "number" && sectionBoundary.index > 0) {
    endIndex = Math.min(endIndex, rowIndex + sectionBoundary.index);
  }

  return endIndex;
}

function extractRoleRows(text: string) {
  if (!TABLE_SALARY_CONTEXT_PATTERN.test(text)) {
    return [];
  }

  const rows: Array<{ role: string; index: number }> = [];
  for (const match of text.matchAll(ROLE_ROW_PATTERN)) {
    const rawRole = match[2];
    if (!rawRole) {
      continue;
    }

    const role = cleanRoleTitle(rawRole);
    if (!isLikelyRoleTitle(role)) {
      continue;
    }

    rows.push({
      role,
      index: match.index ?? 0,
    });
  }

  return rows;
}

function extractCompensationEntriesFromRows(text: string) {
  const rows = extractRoleRows(text);
  if (rows.length === 0) {
    return [];
  }

  const entries: CompensationEntry[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const nextRow = rows[index + 1];
    const chunkEnd = resolveRowChunkEnd(text, row.index, nextRow?.index ?? null);
    const chunk = text.slice(row.index, chunkEnd);
    const salaryValues = extractSalaryFromRowChunk(chunk);
    if (salaryValues.length === 0) {
      continue;
    }

    const roleVariants = splitRoleVariants(row.role, salaryValues.length);
    if (roleVariants.length === salaryValues.length) {
      for (let variantIndex = 0; variantIndex < roleVariants.length; variantIndex += 1) {
        entries.push({
          role: roleVariants[variantIndex],
          salary: salaryValues[variantIndex],
        });
      }
      continue;
    }

    if (roleVariants.length > 1 && salaryValues.length === 1) {
      for (const roleVariant of roleVariants) {
        entries.push({
          role: roleVariant,
          salary: salaryValues[0],
        });
      }
      continue;
    }

    if (salaryValues.length > 1) {
      entries.push({
        role: row.role,
        salary: summarizeCompensationEntries(
          salaryValues.map((salary) => ({
            role: row.role,
            salary,
          }))
        ),
      });
      continue;
    }

    entries.push({
      role: row.role,
      salary: salaryValues[0],
    });
  }

  return dedupeCompensationEntries(entries);
}

function extractCompensationEntriesNearAmounts(text: string) {
  const rows = extractRoleRows(text);
  if (rows.length === 0) {
    return [];
  }

  const entries: CompensationEntry[] = [];
  SALARY_AMOUNT_GLOBAL_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(SALARY_AMOUNT_GLOBAL_PATTERN)) {
    const salary = match[0];
    const matchIndex = match.index ?? -1;
    if (!salary || matchIndex < 0) {
      continue;
    }

    let nearestRow: { role: string; index: number } | null = null;
    for (const row of rows) {
      if (row.index >= matchIndex) {
        break;
      }
      if (matchIndex - row.index > 2_000) {
        continue;
      }
      nearestRow = row;
    }

    if (!nearestRow) {
      continue;
    }

    const tableHeaderWindowStart = Math.max(0, nearestRow.index - 1_500);
    const tableHeaderWindow = text.slice(tableHeaderWindowStart, matchIndex);
    if (!TABLE_SALARY_CONTEXT_PATTERN.test(tableHeaderWindow)) {
      continue;
    }

    entries.push({
      role: nearestRow.role,
      salary: appendSalaryTail(
        text,
        trimSalaryPunctuation(normalizeWhitespace(salary))
      ),
    });
  }

  return dedupeCompensationEntries(entries);
}

function extractCompensationEntries(text: string | null | undefined) {
  const normalized = normalizeSearchText(text);
  if (!normalized) {
    return [];
  }

  const rowChunkEntries = extractCompensationEntriesFromRows(normalized);
  if (rowChunkEntries.length > 0) {
    return rowChunkEntries;
  }

  return extractCompensationEntriesNearAmounts(normalized);
}

function parseSalaryAnchorValue(value: string) {
  const match = value.match(/\d[\d,]*/);
  if (!match?.[0]) {
    return null;
  }

  const normalized = match[0].replace(/,/g, "");
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSalaryAmount(value: number) {
  return `Rs. ${value.toLocaleString("en-IN")}`;
}

function summarizeCompensationEntries(entries: CompensationEntry[]) {
  if (entries.length === 0) {
    return NO_SALARY_LABEL;
  }

  const uniqueSalaryValues = Array.from(new Set(entries.map((entry) => entry.salary)));
  if (uniqueSalaryValues.length === 1) {
    return entries.length === 1
      ? uniqueSalaryValues[0]
      : `${uniqueSalaryValues[0]} across ${entries.length} roles`;
  }

  const numericValues = uniqueSalaryValues
    .map((value) => parseSalaryAnchorValue(value))
    .filter((value): value is number => value !== null);

  if (numericValues.length === uniqueSalaryValues.length) {
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    if (min !== max) {
      return `${formatSalaryAmount(min)} - ${formatSalaryAmount(max)} across ${entries.length} roles`;
    }
  }

  return `Multiple salary values across ${entries.length} roles`;
}

function resolveTextSalaryInfo(text: string | null | undefined): ResolvedSalaryInfo {
  const entries = extractCompensationEntries(text);
  if (entries.length > 0) {
    return {
      summary: summarizeCompensationEntries(entries),
      entries,
    };
  }

  const singleSalary = extractSingleSalaryText(text);
  if (singleSalary) {
    return {
      summary: singleSalary,
      entries: [],
    };
  }

  return {
    summary: NO_SALARY_LABEL,
    entries: [],
  };
}

export function extractSalaryText(text: string | null | undefined) {
  const resolved = resolveTextSalaryInfo(text);
  return resolved.summary === NO_SALARY_LABEL ? null : resolved.summary;
}

export function resolveJobSalaryInfo({
  salary,
  content,
  pdfContent,
}: {
  salary?: string | null;
  content?: string | null;
  pdfContent?: string | null;
}): ResolvedSalaryInfo {
  for (const candidate of [pdfContent, content]) {
    const resolved = resolveTextSalaryInfo(candidate);
    if (resolved.summary !== NO_SALARY_LABEL) {
      return resolved;
    }
  }

  const storedSalary = typeof salary === "string" ? salary.trim() : "";
  if (storedSalary) {
    const resolved = resolveTextSalaryInfo(storedSalary);
    if (resolved.summary !== NO_SALARY_LABEL) {
      return resolved;
    }

    return {
      summary: storedSalary,
      entries: [],
    };
  }

  return {
    summary: NO_SALARY_LABEL,
    entries: [],
  };
}

export function resolveJobSalaryLabel(args: {
  salary?: string | null;
  content?: string | null;
  pdfContent?: string | null;
}) {
  return resolveJobSalaryInfo(args).summary;
}
