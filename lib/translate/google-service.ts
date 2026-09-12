import "server-only";

const GOOGLE_TRANSLATE_API_URL =
  "https://translation.googleapis.com/language/translate/v2";

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'");
}

export async function translateSourceTextWithGoogle({
  sourceText,
  targetLanguageCode,
}: {
  sourceText: string;
  targetLanguageCode: string;
}) {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is not configured.");
  }

  const response = await fetch(`${GOOGLE_TRANSLATE_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      format: "text",
      q: sourceText,
      target: targetLanguageCode,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { message?: string };
        data?: { translations?: Array<{ translatedText?: string }> };
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message?.trim() || "Google Translation API request failed."
    );
  }

  const translatedText = decodeHtmlEntities(
    payload?.data?.translations?.[0]?.translatedText?.trim() ?? ""
  );

  return {
    translatedText,
    model: {
      id: "google-translation-api",
      name: "Google Translation API",
      provider: "google",
    },
  };
}
