import "server-only";

import { sanitizeText } from "@/lib/utils";

const BASIC_LATIN_REGEX = /^[a-z0-9\s.,!?'"()-:;]+$/i;

export function normalizeTags(tags: string[] | undefined | null): string[] {
  if (!tags?.length) {
    return [];
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    seen.add(normalized.slice(0, 48));
  }
  return Array.from(seen);
}

export function normalizeModels(models: string[] | undefined | null): string[] {
  if (!models?.length) {
    return [];
  }
  const seen = new Set<string>();
  for (const model of models) {
    const normalized = model.trim();
    if (!normalized) {
      continue;
    }
    seen.add(normalized);
  }
  return Array.from(seen);
}

export function sanitizeRagContent(value: string): string {
  return sanitizeText(value).trim();
}

export function normalizeSourceUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function detectQueryLanguage(text: string): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return "und";
  }
  const khasiMarkers = ["khasi", "kumno", "khublei", "shibun"];
  const pnarMarkers = ["pnar", "narwan", "u moo"];

  if (khasiMarkers.some((marker) => normalized.includes(marker))) {
    return "kha";
  }
  if (pnarMarkers.some((marker) => normalized.includes(marker))) {
    return "pna";
  }
  if (BASIC_LATIN_REGEX.test(normalized)) {
    return "en";
  }
  return "mul";
}
