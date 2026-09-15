import type { CharacterRefImage } from "@/lib/db/schema";

export const CHARACTER_REFERENCE_CATEGORIES = [
  "identity",
  "expression",
  "additional",
] as const;

export type CharacterReferenceCategory =
  (typeof CHARACTER_REFERENCE_CATEGORIES)[number];

export const CHARACTER_REFERENCE_TYPES = [
  "front",
  "left",
  "right",
  "smile",
  "laugh",
  "sad",
  "shock",
  "angry",
  "neutral",
  "other",
] as const;

export type CharacterReferenceType = (typeof CHARACTER_REFERENCE_TYPES)[number];

export type CharacterReferenceImage = CharacterRefImage & {
  category?: CharacterReferenceCategory | null;
  type?: CharacterReferenceType | null;
  label?: string | null;
};

const IDENTITY_TYPES = new Set<CharacterReferenceType>([
  "front",
  "left",
  "right",
]);
const EXPRESSION_TYPES = new Set<CharacterReferenceType>([
  "smile",
  "laugh",
  "sad",
  "shock",
  "angry",
  "neutral",
]);

function isReferenceCategory(value: unknown): value is CharacterReferenceCategory {
  return (
    typeof value === "string" &&
    (CHARACTER_REFERENCE_CATEGORIES as readonly string[]).includes(value)
  );
}

function isReferenceType(value: unknown): value is CharacterReferenceType {
  return (
    typeof value === "string" &&
    (CHARACTER_REFERENCE_TYPES as readonly string[]).includes(value)
  );
}

function legacyTypeFromRole(role: string | null | undefined) {
  const normalized = role?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.includes("front") || normalized === "face") {
    return "front" as const;
  }
  if (normalized.includes("left")) {
    return "left" as const;
  }
  if (normalized.includes("right")) {
    return "right" as const;
  }
  if (normalized.includes("smil") || normalized.includes("happy")) {
    return "smile" as const;
  }
  if (normalized.includes("laugh") || normalized.includes("grin")) {
    return "laugh" as const;
  }
  if (normalized.includes("sad") || normalized.includes("cry")) {
    return "sad" as const;
  }
  if (
    normalized.includes("shock") ||
    normalized.includes("surpris") ||
    normalized.includes("astonish")
  ) {
    return "shock" as const;
  }
  if (normalized.includes("angry") || normalized.includes("anger")) {
    return "angry" as const;
  }
  if (normalized.includes("neutral") || normalized.includes("serious")) {
    return "neutral" as const;
  }
  return null;
}

function categoryForType(
  type: CharacterReferenceType,
  category?: CharacterReferenceCategory | null
): CharacterReferenceCategory {
  if (category) {
    return category;
  }
  if (IDENTITY_TYPES.has(type)) {
    return "identity";
  }
  if (EXPRESSION_TYPES.has(type)) {
    return "expression";
  }
  return "additional";
}

export function normalizeCharacterReferences(
  refImages: CharacterRefImage[] | null | undefined
): CharacterReferenceImage[] {
  if (!Array.isArray(refImages)) {
    return [];
  }

  const hasExplicitMetadata = refImages.some((ref) => {
    const candidate = ref as CharacterReferenceImage;
    return isReferenceCategory(candidate.category) || isReferenceType(candidate.type);
  });

  return refImages.map((ref, index) => {
    const candidate = ref as CharacterReferenceImage;
    const explicitType = isReferenceType(candidate.type)
      ? candidate.type
      : null;
    const legacyType = legacyTypeFromRole(candidate.role);
    const type =
      explicitType ??
      legacyType ??
      (!hasExplicitMetadata && index === 0 ? "front" : "other");
    const category = categoryForType(
      type,
      isReferenceCategory(candidate.category) ? candidate.category : null
    );
    const label =
      typeof candidate.label === "string" && candidate.label.trim().length > 0
        ? candidate.label.trim().slice(0, 80)
        : null;

    return {
      ...candidate,
      category,
      type,
      label,
      role: candidate.role?.trim() || type,
      isPrimary:
        type === "front" && category === "identity"
          ? true
          : Boolean(candidate.isPrimary),
    };
  });
}

export function hasFrontReference(refImages: CharacterRefImage[] | null | undefined) {
  return normalizeCharacterReferences(refImages).some(
    (ref) => ref.category === "identity" && ref.type === "front"
  );
}
