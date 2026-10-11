import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseStorageObjectRef = {
  bucket: string;
  path: string;
};

const STORAGE_OBJECT_PATH_REGEX =
  /^\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/i;

function getSupabaseHost() {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

export function parseSupabaseStorageObjectUrl(
  sourceUrl: string
): SupabaseStorageObjectRef | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }

  const expectedHost = getSupabaseHost();
  if (!expectedHost) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.host.toLowerCase() !== expectedHost) {
      return null;
    }

    const match = parsed.pathname.match(STORAGE_OBJECT_PATH_REGEX);
    if (!match?.[1] || !match?.[2]) {
      return null;
    }

    const bucket = decodeURIComponent(match[1]);
    const path = decodeURIComponent(match[2]);
    if (!bucket || !path) {
      return null;
    }

    return { bucket, path };
  } catch {
    return null;
  }
}

export async function resolveServerFetchableSupabaseUrl(
  sourceUrl: string,
  expiresInSeconds = 60
) {
  const objectRef = parseSupabaseStorageObjectUrl(sourceUrl);
  if (!objectRef) {
    return sourceUrl;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(objectRef.bucket)
    .createSignedUrl(objectRef.path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign Supabase storage URL: ${error?.message ?? "unknown error"}`
    );
  }

  return data.signedUrl;
}
