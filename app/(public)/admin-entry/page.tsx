import { AdminEntryClient } from "./admin-entry-client";

const DEFAULT_LOGIN_PATH = "/login?callbackUrl=%2Fadmin%2Fsettings";

function normalizeNextPath(rawPath: string | null) {
  if (typeof rawPath !== "string") {
    return DEFAULT_LOGIN_PATH;
  }

  const trimmed = rawPath.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_LOGIN_PATH;
  }

  return trimmed;
}

export default async function AdminEntryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextRaw = resolvedSearchParams?.next;
  const nextPath =
    typeof nextRaw === "string"
      ? nextRaw
      : Array.isArray(nextRaw)
        ? (nextRaw[0] ?? null)
        : null;

  return <AdminEntryClient initialNextPath={normalizeNextPath(nextPath)} />;
}
