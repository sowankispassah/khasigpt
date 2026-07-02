export const DATE_OF_BIRTH_LOCK_MESSAGE =
  "Date of birth is already set. To correct it, contact support.";

export function isDateOfBirthChangeBlocked(
  currentDateOfBirth: string | null | undefined,
  requestedDateOfBirth: string | undefined
) {
  return Boolean(
    currentDateOfBirth &&
      typeof requestedDateOfBirth !== "undefined" &&
      requestedDateOfBirth !== currentDateOfBirth
  );
}
