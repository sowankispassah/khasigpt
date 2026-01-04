type GoogleIdTokenPayload = {
  aud: string;
  email: string;
  emailVerified: boolean;
  exp?: number;
  familyName?: string;
  givenName?: string;
  name?: string;
  picture?: string;
  sub: string;
};

const GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const VALID_ISSUERS = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

function parseEpochSeconds(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function verifyGoogleIdToken(
  idToken: string,
  allowedClientIds: string[]
): Promise<GoogleIdTokenPayload | null> {
  const trimmedToken = idToken.trim();
  if (!trimmedToken || allowedClientIds.length === 0) {
    return null;
  }

  try {
    const response = await fetch(
      `${GOOGLE_TOKEN_INFO_URL}?id_token=${encodeURIComponent(trimmedToken)}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const aud = typeof data.aud === "string" ? data.aud : null;
    const email = typeof data.email === "string" ? data.email : null;
    const sub = typeof data.sub === "string" ? data.sub : null;
    const issuer = typeof data.iss === "string" ? data.iss : null;
    const emailVerifiedRaw = data.email_verified;
    const emailVerified =
      emailVerifiedRaw === true || emailVerifiedRaw === "true";

    if (!aud || !allowedClientIds.includes(aud)) {
      return null;
    }
    if (!email || !sub || !emailVerified) {
      return null;
    }
    if (issuer && !VALID_ISSUERS.has(issuer)) {
      return null;
    }

    const exp = parseEpochSeconds(data.exp);
    if (exp && Date.now() / 1000 >= exp) {
      return null;
    }

    return {
      aud,
      email,
      emailVerified,
      exp: exp ?? undefined,
      familyName:
        typeof data.family_name === "string" ? data.family_name : undefined,
      givenName:
        typeof data.given_name === "string" ? data.given_name : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      picture: typeof data.picture === "string" ? data.picture : undefined,
      sub,
    };
  } catch {
    return null;
  }
}
