import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/api/client";

type AvatarEntry = {
  lastFetchedAt: number;
  url: string | null;
};

const AVATAR_CACHE_TTL_MS = 5 * 60 * 1000;
const avatarEntries = new Map<string, AvatarEntry>();
const avatarFetches = new Map<string, Promise<void>>();
const avatarHydrations = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function getStorageKey(userId: string) {
  return `khasigpt:native:avatar:${userId}`;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function writeAvatarEntry(userId: string, url: string | null, lastFetchedAt: number) {
  const current = avatarEntries.get(userId);
  if (
    current &&
    current.url === url &&
    current.lastFetchedAt === lastFetchedAt
  ) {
    return;
  }

  avatarEntries.set(userId, { lastFetchedAt, url });
  emitChange();
}

async function persistAvatarEntry(userId: string, entry: AvatarEntry) {
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(entry)).catch(
    () => undefined
  );
}

export function subscribeToAvatarStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAvatarSnapshot(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }
  return avatarEntries.get(userId)?.url ?? null;
}

export async function hydrateAvatar(userId: string) {
  if (avatarEntries.has(userId)) {
    return;
  }

  const existingHydration = avatarHydrations.get(userId);
  if (existingHydration) {
    return existingHydration;
  }

  const hydration = AsyncStorage.getItem(getStorageKey(userId))
    .then((rawValue) => {
      if (!rawValue) {
        return;
      }

      const parsed = JSON.parse(rawValue) as Partial<AvatarEntry> | null;
      if (!parsed || !("url" in parsed)) {
        return;
      }

      writeAvatarEntry(
        userId,
        parsed.url ?? null,
        typeof parsed.lastFetchedAt === "number" ? parsed.lastFetchedAt : 0
      );
    })
    .catch(() => undefined)
    .finally(() => {
      avatarHydrations.delete(userId);
    });

  avatarHydrations.set(userId, hydration);
  return hydration;
}

export async function ensureAvatar(userId: string, force = false) {
  await hydrateAvatar(userId);

  const current = avatarEntries.get(userId);
  const isFresh =
    current && Date.now() - current.lastFetchedAt < AVATAR_CACHE_TTL_MS;
  if (!force && isFresh) {
    return;
  }

  const existingFetch = avatarFetches.get(userId);
  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = api
    .profile()
    .then(async (payload) => {
      const nextEntry = {
        lastFetchedAt: Date.now(),
        url: payload.user.avatar ?? null,
      };
      writeAvatarEntry(userId, nextEntry.url, nextEntry.lastFetchedAt);
      await persistAvatarEntry(userId, nextEntry);
    })
    .catch(() => undefined)
    .finally(() => {
      avatarFetches.delete(userId);
    });

  avatarFetches.set(userId, fetchPromise);
  return fetchPromise;
}

export function updateAvatar(userId: string, url: string | null) {
  const nextEntry = {
    lastFetchedAt: Date.now(),
    url,
  };
  writeAvatarEntry(userId, nextEntry.url, nextEntry.lastFetchedAt);
  void persistAvatarEntry(userId, nextEntry);
}
