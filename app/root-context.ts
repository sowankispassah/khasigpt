import "server-only";

import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { cache } from "react";

import { auth } from "@/app/(auth)/auth";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export type RootContext = Awaited<ReturnType<typeof getTranslationBundle>> & {
  preferredLanguage: string | null;
  session: Session | null;
};

export const loadRootContext = cache(async (): Promise<RootContext> => {
  const cookieStore = cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const sessionToken =
    cookieStore.get("__Secure-authjs.session-token") ??
    cookieStore.get("authjs.session-token");

  const translationPromise = getTranslationBundle(preferredLanguage);
  const sessionPromise = sessionToken ? auth() : Promise.resolve(null);

  const translation = await translationPromise;
  const session = (await sessionPromise) as Session | null;

  return {
    ...translation,
    preferredLanguage,
    session,
  };
});
