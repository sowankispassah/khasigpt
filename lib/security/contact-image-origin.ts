export function contactImageOrigin(storageUrl: string | undefined) {
  try {
    const url = new URL(storageUrl ?? "");
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : "";
  } catch {
    return "";
  }
}
