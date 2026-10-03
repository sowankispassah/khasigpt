const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const WIKIMEDIA_TIMEOUT_MS = 5_000;
const WIKIMEDIA_CACHE_SECONDS = 86_400;
const MAX_WIKIMEDIA_IMAGES = 12;

type WikidataClaim = {
  mainsnak?: { datavalue?: { value?: unknown } };
};

type WikidataEntity = {
  claims?: { P18?: WikidataClaim[] };
};

type WikidataResponse = {
  entities?: Record<string, WikidataEntity>;
};

type CommonsMetadataValue = { value?: string };

type CommonsImageInfo = {
  descriptionurl?: string;
  extmetadata?: {
    Artist?: CommonsMetadataValue;
    Credit?: CommonsMetadataValue;
    LicenseShortName?: CommonsMetadataValue;
    LicenseUrl?: CommonsMetadataValue;
  };
  thumburl?: string;
  user?: string;
};

type CommonsResponse = {
  query?: {
    pages?: Array<{
      imageinfo?: CommonsImageInfo[];
      missing?: boolean;
      title?: string;
    }>;
  };
};

export type WikimediaImageAttribution = {
  displayName: string;
  uri: string | null;
};

export type WikimediaImage = {
  attributions: WikimediaImageAttribution[];
  imageUrl: string;
};

export type WikimediaImageCandidate = {
  commonsFileName: string | null;
  wikidataId: string | null;
};

function safeWikimediaUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (
      url.hostname !== "commons.wikimedia.org" &&
      url.hostname !== "upload.wikimedia.org"
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeLicenseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) =>
      named[name.toLocaleLowerCase()] ?? match,
    );
}

function plainMetadataText(value: string | undefined) {
  if (!value) return null;
  const text = decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 160) : null;
}

export function normalizeWikidataId(value: string | undefined) {
  const id = value?.trim().toUpperCase();
  return id && /^Q\d+$/.test(id) ? id : null;
}

export function normalizeCommonsFileName(value: string | undefined) {
  const name = value?.trim().replace(/^File:/i, "").replaceAll("_", " ");
  if (!name || /^(?:Category|Special):/i.test(name)) return null;
  return name.slice(0, 240);
}

export function extractWikidataImageFileName(
  entity: WikidataEntity | undefined,
) {
  const value = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return typeof value === "string" ? normalizeCommonsFileName(value) : null;
}

function fileTitle(fileName: string) {
  return `File:${normalizeCommonsFileName(fileName) ?? fileName}`;
}

function normalizedFileKey(value: string) {
  return fileTitle(value).replaceAll("_", " ").toLocaleLowerCase();
}

async function fetchWikidataImages(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("ids", ids.join("|"));
  url.searchParams.set("props", "claims");
  const response = await fetch(url, {
    headers: { "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)" },
    next: { revalidate: WIKIMEDIA_CACHE_SECONDS },
    signal: AbortSignal.timeout(WIKIMEDIA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Wikidata returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as WikidataResponse;
  const images = new Map<string, string>();
  for (const id of ids) {
    const fileName = extractWikidataImageFileName(payload.entities?.[id]);
    if (fileName) images.set(id, fileName);
  }
  return images;
}

async function fetchCommonsImages(fileNames: string[]) {
  if (!fileNames.length) return new Map<string, WikimediaImage>();
  const url = new URL(COMMONS_API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("titles", fileNames.map(fileTitle).join("|"));
  url.searchParams.set("iiprop", "url|user|extmetadata");
  url.searchParams.set("iiurlwidth", "900");
  url.searchParams.set("iiextmetadatalanguage", "en");
  url.searchParams.set(
    "iiextmetadatafilter",
    "Artist|Credit|LicenseShortName|LicenseUrl",
  );
  const response = await fetch(url, {
    headers: { "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)" },
    next: { revalidate: WIKIMEDIA_CACHE_SECONDS },
    signal: AbortSignal.timeout(WIKIMEDIA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Wikimedia Commons returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as CommonsResponse;
  const images = new Map<string, WikimediaImage>();
  for (const page of payload.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const imageUrl = safeWikimediaUrl(info?.thumburl);
    if (!(page.title && info && imageUrl) || page.missing) continue;
    const descriptionUrl = safeWikimediaUrl(info.descriptionurl);
    const creator =
      plainMetadataText(info.extmetadata?.Artist?.value) ??
      plainMetadataText(info.extmetadata?.Credit?.value) ??
      plainMetadataText(info.user);
    const license = plainMetadataText(
      info.extmetadata?.LicenseShortName?.value,
    );
    const licenseUrl = safeLicenseUrl(
      info.extmetadata?.LicenseUrl?.value,
    );
    const attributions: WikimediaImageAttribution[] = [
      {
        displayName: creator ? `Photo: ${creator}` : "Wikimedia Commons photo",
        uri: descriptionUrl,
      },
    ];
    if (license) {
      attributions.push({ displayName: license, uri: licenseUrl });
    }
    images.set(normalizedFileKey(page.title), { attributions, imageUrl });
  }
  return images;
}

export async function resolveWikimediaImages(
  candidates: WikimediaImageCandidate[],
) {
  const limited = candidates.slice(0, MAX_WIKIMEDIA_IMAGES);
  const wikidataIds = Array.from(
    new Set(limited.flatMap((item) => (item.wikidataId ? [item.wikidataId] : []))),
  );
  const wikidataImages = await fetchWikidataImages(wikidataIds);
  const resolvedFileNames = limited.map(
    (item) =>
      item.commonsFileName ??
      (item.wikidataId ? wikidataImages.get(item.wikidataId) : undefined) ??
      null,
  );
  const fileNames = Array.from(
    new Set(resolvedFileNames.flatMap((name) => (name ? [name] : []))),
  );
  const commonsImages = await fetchCommonsImages(fileNames);
  return resolvedFileNames.map((name) =>
    name ? (commonsImages.get(normalizedFileKey(name)) ?? null) : null,
  );
}
