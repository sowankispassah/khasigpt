const SALARY_LABELS = [
  "salary",
  "pay scale",
  "pay matrix",
  "remuneration",
  "emoluments",
  "consolidated pay",
  "stipend",
  "honorarium",
  "compensation",
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
] as const;

const ESCAPED_SALARY_LABELS = SALARY_LABELS.map((label) =>
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
  /(?:\u20b9|rs\.?|inr)\s?\d[\d,]*(?:\s*\/-)?(?:\s*(?:-|to|\u2013)\s*(?:\u20b9|rs\.?|inr)?\s?\d[\d,]*(?:\s*\/-)?)?(?:\s*(?:\([^)]{1,40}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances|including allowances))*/i;

const SHORT_NUMERIC_SALARY_PATTERN =
  /^\d[\d,]*(?:\s*\/-)?(?:\s*(?:-|to|\u2013)\s*\d[\d,]*(?:\s*\/-)?)?(?:\s*(?:\([^)]{1,40}\)|per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?|consolidated|fixed(?: pay)?|stipend|honorarium|plus allowances))*$/i;

const LABELLED_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\s*[:\\-]?\\s*([\\s\\S]{1,220})`,
  "ig"
);

const CONTEXTUAL_QUALITATIVE_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\b[^.!?\\n\\r]{0,60}?(${QUALITATIVE_SALARY_PATTERN.source})`,
  "i"
);

const CONTEXTUAL_PREFIX_SALARY_PATTERN = new RegExp(
  `(?:${ESCAPED_SALARY_LABELS})\\b[^.!?\\n\\r]{0,90}?(${SALARY_AMOUNT_PATTERN.source})`,
  "i"
);

const CONTEXTUAL_SUFFIX_SALARY_PATTERN = new RegExp(
  `(${SALARY_AMOUNT_PATTERN.source})[^.!?\\n\\r]{0,50}\\b(?:per month|monthly|per annum|annum|lpa|lakhs? p\\.?a\\.?|consolidated|salary|stipend|honorarium)\\b`,
  "i"
);

const NON_SALARY_PREFIX_PATTERN =
  /^(?:application fee|exam fee|registration fee|fee|age limit|last date|deadline|notification date|qualification|essential qualification|eligibility|experience)\b/i;

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
    new RegExp(
      `\\s+(?=(?:${ESCAPED_NON_SALARY_SECTION_LABELS})\\b)`,
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

function extractQualitativeSalary(value: string) {
  const match = value.match(QUALITATIVE_SALARY_PATTERN);
  return match?.[1] ? trimSalaryPunctuation(normalizeWhitespace(match[1])) : null;
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
    return trimSalaryPunctuation(normalizeWhitespace(amountMatch[0]));
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

  return amountMatch.index === 0 || /\b(?:per month|monthly|per annum|annum|stipend|honorarium|consolidated)\b/i.test(cleaned);
}

export function extractSalaryText(text: string | null | undefined) {
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

  const contextualQualitative = normalized.match(CONTEXTUAL_QUALITATIVE_SALARY_PATTERN);
  if (contextualQualitative?.[1]) {
    return trimSalaryPunctuation(normalizeWhitespace(contextualQualitative[1]));
  }

  const contextualPrefix = normalized.match(CONTEXTUAL_PREFIX_SALARY_PATTERN);
  if (contextualPrefix?.[1]) {
    return trimSalaryPunctuation(normalizeWhitespace(contextualPrefix[1]));
  }

  const contextualSuffix = normalized.match(CONTEXTUAL_SUFFIX_SALARY_PATTERN);
  if (contextualSuffix?.[1]) {
    return trimSalaryPunctuation(normalizeWhitespace(contextualSuffix[1]));
  }

  return null;
}

export function resolveJobSalaryLabel({
  salary,
  content,
  pdfContent,
}: {
  salary?: string | null;
  content?: string | null;
  pdfContent?: string | null;
}) {
  for (const candidate of [salary, pdfContent, content]) {
    const resolved = extractSalaryText(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return "Not disclosed";
}
