import "server-only";

import { cookies } from "next/headers";
import type { Session } from "next-auth";

import { auth } from "@/app/(auth)/auth";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export type RootContext = Awaited<ReturnType<typeof getTranslationBundle>> & {
  preferredLanguage: string | null;
  session: Session | null;
};

export async function loadRootContext(): Promise<RootContext> {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const sessionToken =
    cookieStore.get("__Secure-authjs.session-token") ??
    cookieStore.get("authjs.session-token");

  const translationPromise = getTranslationBundle(preferredLanguage);
  const sessionPromise: Promise<Session | null> = sessionToken
    ? auth()
    : Promise.resolve(null);

  const [translation, session] = await Promise.all([
    translationPromise,
    sessionPromise,
  ]);

  return {
    ...translation,
    preferredLanguage,
    session,
  };
}
