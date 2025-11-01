"use server";

import { cookies } from "next/headers";

import { getLanguageByCode, getDefaultLanguage } from "@/lib/i18n/languages";

const LANGUAGE_COOKIE = "lang";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export async function setPreferredLanguageAction(code: string) {
  const cookieStore = await cookies();

  const languageOption = code ? await getLanguageByCode(code) : null;

  if (!languageOption || !languageOption.isActive) {
    const fallback = await getDefaultLanguage();
    if (!fallback) {
      throw new Error("No default language configured");
    }

    cookieStore.set(LANGUAGE_COOKIE, fallback.code, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: ONE_YEAR_IN_SECONDS,
    });

    return {
      code: fallback.code,
    };
  }

  cookieStore.set(LANGUAGE_COOKIE, languageOption.code, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: ONE_YEAR_IN_SECONDS,
  });

  return {
    code: languageOption.code,
  };
}
