export class AuthLookupUnavailableError extends Error {
  code = "auth_lookup_unavailable";
  status = 503;

  constructor(message = "Authentication lookup is temporarily unavailable.") {
    super(message);
    this.name = "AuthLookupUnavailableError";
  }
}
