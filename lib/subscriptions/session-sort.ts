export const SESSION_SORT_VALUES = ["latest", "usage"] as const;

export type SessionSortOption = (typeof SESSION_SORT_VALUES)[number];

export const SESSION_SORT_DEFAULT: SessionSortOption = "latest";

export function isSessionSortOption(
  value: string | undefined | null
): value is SessionSortOption {
  return SESSION_SORT_VALUES.includes(value as SessionSortOption);
}
