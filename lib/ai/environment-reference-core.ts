export const ENVIRONMENT_ENTITY_TYPES = [
  "PLACE",
  "LANDMARK",
  "BUILDING",
  "VENUE",
  "NATURAL_LOCATION",
] as const;

export type EnvironmentEntityType = (typeof ENVIRONMENT_ENTITY_TYPES)[number];

export type EnvironmentReferenceDecision = {
  shouldSearch: boolean;
  entity: string | null;
  entityType: EnvironmentEntityType | null;
  geographicContext: string | null;
  historicalPeriod: string | null;
  ambiguous: boolean;
};

const KNOWN_MEGHALAYA_ENTITIES: Array<{
  pattern: RegExp;
  entity: string;
  entityType: EnvironmentEntityType;
  geographicContext: string;
}> = [
  {
    pattern: /\blaitumkhrah\b/i,
    entity: "Laitumkhrah",
    entityType: "PLACE",
    geographicContext: "Shillong Meghalaya India",
  },
  {
    pattern: /\bpolice bazaar\b|\bpolice bazar\b/i,
    entity: "Police Bazaar",
    entityType: "PLACE",
    geographicContext: "Shillong Meghalaya India",
  },
  {
    pattern: /\bward['’]?s lake\b/i,
    entity: "Ward's Lake",
    entityType: "NATURAL_LOCATION",
    geographicContext: "Shillong Meghalaya India",
  },
  {
    pattern: /\bumiam lake\b|\bbarapani lake\b/i,
    entity: "Umiam Lake",
    entityType: "NATURAL_LOCATION",
    geographicContext: "Meghalaya India",
  },
  {
    pattern: /\bshillong peak\b/i,
    entity: "Shillong Peak",
    entityType: "NATURAL_LOCATION",
    geographicContext: "Meghalaya India",
  },
  {
    pattern: /\bmawlynnong\b/i,
    entity: "Mawlynnong",
    entityType: "PLACE",
    geographicContext: "Meghalaya India",
  },
  {
    pattern: /\bcherrapunji\b|\bsohra\b/i,
    entity: "Cherrapunji",
    entityType: "PLACE",
    geographicContext: "Meghalaya India",
  },
  {
    pattern: /\bshillong\b/i,
    entity: "Shillong",
    entityType: "PLACE",
    geographicContext: "Meghalaya India",
  },
];

export function emptyEnvironmentReferenceDecision(): EnvironmentReferenceDecision {
  return {
    shouldSearch: false,
    entity: null,
    entityType: null,
    geographicContext: null,
    historicalPeriod: null,
    ambiguous: false,
  };
}

function normalizedNullableString(value: unknown, maxLength = 180) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : null;
}

export function parseEnvironmentReferenceDecision(
  value: unknown
): EnvironmentReferenceDecision {
  if (!value || typeof value !== "object") {
    return emptyEnvironmentReferenceDecision();
  }
  const record = value as Record<string, unknown>;
  const entity = normalizedNullableString(record.entity);
  const entityType = ENVIRONMENT_ENTITY_TYPES.includes(
    record.entityType as EnvironmentEntityType
  )
    ? (record.entityType as EnvironmentEntityType)
    : null;
  const ambiguous = record.ambiguous === true;
  return {
    shouldSearch:
      record.shouldSearch === true && Boolean(entity && entityType) && !ambiguous,
    entity,
    entityType,
    geographicContext: normalizedNullableString(record.geographicContext),
    historicalPeriod: normalizedNullableString(record.historicalPeriod, 40),
    ambiguous,
  };
}

export function inferKnownEnvironmentDecision(
  prompt: string
): EnvironmentReferenceDecision | null {
  const match = KNOWN_MEGHALAYA_ENTITIES.find((entry) =>
    entry.pattern.test(prompt)
  );
  if (!match) {
    return null;
  }
  const currentYear = new Date().getUTCFullYear();
  const requestedYear = Array.from(prompt.matchAll(/\b(18|19|20)\d{2}\b/g))
    .map((item) => Number(item[0]))
    .find((year) => year < currentYear - 10);
  return {
    shouldSearch: true,
    entity: match.entity,
    entityType: match.entityType,
    geographicContext: match.geographicContext,
    historicalPeriod: requestedYear ? String(requestedYear) : null,
    ambiguous: false,
  };
}

export function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
