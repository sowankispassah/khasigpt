import { createHash, createSign } from "node:crypto";
import { ChatSDKError } from "@/lib/errors";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANDROID_PUBLISHER_SCOPE =
  "https://www.googleapis.com/auth/androidpublisher";

type GoogleServiceAccount = {
  client_email?: string;
  private_key?: string;
};

export type GooglePlayProductPurchase = {
  acknowledgementState?: number;
  consumptionState?: number;
  developerPayload?: string;
  kind?: string;
  orderId?: string;
  purchaseState?: number;
  purchaseTimeMillis?: string;
  purchaseType?: number;
  quantity?: number;
  regionCode?: string;
};

function base64Url(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Env(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

function parseServiceAccount(rawJson: string) {
  const parsed = JSON.parse(rawJson) as GoogleServiceAccount;
  if (parsed.client_email && parsed.private_key) {
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function getServiceAccount() {
  const rawJson =
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ??
    (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64
      ? decodeBase64Env(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64)
      : null);
  if (rawJson) {
    try {
      const serviceAccount = parseServiceAccount(rawJson);
      if (serviceAccount) {
        return serviceAccount;
      }
    } catch {
      throw new ChatSDKError(
        "bad_request:api",
        "Google Play service account JSON is invalid."
      );
    }
  }

  const clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL;
  const privateKey = (
    process.env.GOOGLE_PLAY_PRIVATE_KEY ??
    (process.env.GOOGLE_PLAY_PRIVATE_KEY_BASE64
      ? decodeBase64Env(process.env.GOOGLE_PLAY_PRIVATE_KEY_BASE64)
      : "")
  ).replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return { clientEmail, privateKey };
  }

  throw new ChatSDKError(
    "bad_request:api",
    "Google Play service account credentials are not configured."
  );
}

export function getGooglePlayPackageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "khasigpt.com";
}

export function hashGooglePlayPurchaseToken(purchaseToken: string) {
  return createHash("sha256").update(purchaseToken).digest("hex");
}

async function getAccessToken() {
  const { clientEmail, privateKey } = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now,
      iss: clientEmail,
      scope: GOOGLE_ANDROID_PUBLISHER_SCOPE,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = base64Url(signer.sign(privateKey));
  const assertion = `${unsignedToken}.${signature}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new ChatSDKError(
      "bad_request:api",
      body?.error_description ?? "Unable to authenticate with Google Play."
    );
  }

  return body.access_token;
}

function purchaseUrl({
  packageName,
  productId,
  purchaseToken,
}: {
  packageName: string;
  productId: string;
  purchaseToken: string;
}) {
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName
  )}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
    purchaseToken
  )}`;
}

export async function getGooglePlayProductPurchase({
  packageName = getGooglePlayPackageName(),
  productId,
  purchaseToken,
}: {
  packageName?: string;
  productId: string;
  purchaseToken: string;
}) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    purchaseUrl({ packageName, productId, purchaseToken }),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );
  const body = (await response.json().catch(() => null)) as
    | (GooglePlayProductPurchase & { error?: { message?: string } })
    | null;

  if (!response.ok || !body) {
    throw new ChatSDKError(
      "bad_request:api",
      body?.error?.message ?? "Google Play purchase could not be verified."
    );
  }

  return body;
}

export async function consumeGooglePlayProductPurchase({
  packageName = getGooglePlayPackageName(),
  productId,
  purchaseToken,
}: {
  packageName?: string;
  productId: string;
  purchaseToken: string;
}) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${purchaseUrl({ packageName, productId, purchaseToken })}:consume`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new ChatSDKError(
      "bad_request:api",
      body?.error?.message ?? "Google Play purchase could not be consumed."
    );
  }
}
