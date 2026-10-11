// Legacy signed sessions have version zero. Never upgrade an existing session
// to the database version: only a successful sign-in may mint a new version.
export function sessionVersionClaim(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}

export function hasCurrentSessionVersion(claim: unknown, current: number) {
  return sessionVersionClaim(claim) === current;
}
