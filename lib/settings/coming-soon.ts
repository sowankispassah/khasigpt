export type ComingSoonContent = {
  eyebrow: string;
  title: string;
};

export type ComingSoonTimerMode = "countdown" | "countup";

export type ComingSoonTimerSetting = {
  label: string;
  mode: ComingSoonTimerMode;
  referenceIso: string;
};

const MAX_EYEBROW_LENGTH = 140;
const MAX_TITLE_LENGTH = 100;
const MAX_TIMER_LABEL_LENGTH = 140;
const DEFAULT_OFFSET_MS = (((97 * 24 + 2) * 60 + 27) * 60 + 8) * 1000;
const DEFAULT_REFERENCE_ISO = new Date(Date.now() + DEFAULT_OFFSET_MS).toISOString();

export const DEFAULT_COMING_SOON_CONTENT: ComingSoonContent = {
  eyebrow: "There Will Be Something Very Awesome",
  title: "Coming Soon",
};

export const DEFAULT_COMING_SOON_TIMER_SETTING: ComingSoonTimerSetting = {
  label: "Launching in",
  mode: "countdown",
  referenceIso: DEFAULT_REFERENCE_ISO,
};

function normalizeTextInput(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

export function normalizeComingSoonContentSetting(
  value: unknown
): ComingSoonContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_COMING_SOON_CONTENT;
  }

  const record = value as Record<string, unknown>;
  const eyebrow =
    normalizeTextInput(record.eyebrow, MAX_EYEBROW_LENGTH) ??
    DEFAULT_COMING_SOON_CONTENT.eyebrow;
  const title =
    normalizeTextInput(record.title, MAX_TITLE_LENGTH) ??
    DEFAULT_COMING_SOON_CONTENT.title;

  return { eyebrow, title };
}

export function sanitizeComingSoonContentInput({
  eyebrow,
  title,
}: {
  eyebrow: unknown;
  title: unknown;
}): ComingSoonContent {
  return {
    eyebrow:
      normalizeTextInput(eyebrow, MAX_EYEBROW_LENGTH) ??
      DEFAULT_COMING_SOON_CONTENT.eyebrow,
    title:
      normalizeTextInput(title, MAX_TITLE_LENGTH) ??
      DEFAULT_COMING_SOON_CONTENT.title,
  };
}

function normalizeTimerMode(value: unknown): ComingSoonTimerMode {
  if (typeof value !== "string") {
    return DEFAULT_COMING_SOON_TIMER_SETTING.mode;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "countup") {
    return "countup";
  }
  if (normalized === "countdown") {
    return "countdown";
  }
  return DEFAULT_COMING_SOON_TIMER_SETTING.mode;
}

function normalizeReferenceIso(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_COMING_SOON_TIMER_SETTING.referenceIso;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return DEFAULT_COMING_SOON_TIMER_SETTING.referenceIso;
  }
  return date.toISOString();
}

export function normalizeComingSoonTimerSetting(
  value: unknown
): ComingSoonTimerSetting {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_COMING_SOON_TIMER_SETTING;
  }

  const record = value as Record<string, unknown>;
  const label =
    normalizeTextInput(record.label, MAX_TIMER_LABEL_LENGTH) ??
    DEFAULT_COMING_SOON_TIMER_SETTING.label;
  const mode = normalizeTimerMode(record.mode);
  const referenceIso = normalizeReferenceIso(record.referenceIso);

  return { label, mode, referenceIso };
}

export function sanitizeComingSoonTimerInput({
  label,
  mode,
  referenceAt,
}: {
  label: unknown;
  mode: unknown;
  referenceAt: unknown;
}): ComingSoonTimerSetting {
  const normalizedLabel =
    normalizeTextInput(label, MAX_TIMER_LABEL_LENGTH) ??
    DEFAULT_COMING_SOON_TIMER_SETTING.label;
  const normalizedMode = normalizeTimerMode(mode);
  const normalizedReferenceIso = normalizeReferenceIso(referenceAt);

  return {
    label: normalizedLabel,
    mode: normalizedMode,
    referenceIso: normalizedReferenceIso,
  };
}
