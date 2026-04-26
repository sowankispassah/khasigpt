export const DEFAULT_AVATAR_BACKGROUND = "#10b981";

export function getInitial(value?: string | null) {
  const trimmed = value?.trim();
  return (trimmed?.slice(0, 1) || "U").toUpperCase();
}
