import type { PlaceImage } from "./image-matching";

// Bounded session cache also coalesces a card and its detail dialog.
const photos = new Map<string, Promise<PlaceImage | null>>();
const waiters: Array<() => void> = [];
let active = 0;
async function slot() {
  if (active >= 3) await new Promise<void>((resolve) => waiters.push(resolve));
  else active++;
}
function release() { const next = waiters.shift(); if (next) next(); else active--; }
export function loadExplorePhoto(token: string): Promise<PlaceImage | null> {
  const existing = photos.get(token);
  if (existing) return existing;
  const pending = (async () => {
    await slot();
    try {
      const response = await fetch("/api/explore/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(18_000) });
      if (!response.ok) throw new Error("photo_unavailable");
      return (await response.json()).photo as PlaceImage | null;
    } finally { release(); }
  })();
  if (photos.size >= 256) photos.delete(photos.keys().next().value as string);
  photos.set(token, pending);
  void pending.catch(() => { if (photos.get(token) === pending) photos.delete(token); });
  return pending;
}
