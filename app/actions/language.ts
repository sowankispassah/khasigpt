"use server";

import { cookies } from "next/headers";

import { getDefaultLanguage, getLanguageByCode } from "@/lib/i18n/languages";
import { withTimeout } from "@/lib/utils/async";

const LANGUAGE_COOKIE = "lang";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const LANGUAGE_LOOKUP_TIMEOUT_MS = 2000;

export async function setPreferredLanguageAction(code: string) {
  const cookieStore = await cookies();

  const normalizedCode =
    typeof code === "string" ? code.trim().toLowerCase() : "";
  let languageOption = null;
  let lookupTimedOut = false;

  if (normalizedCode) {
    try {
      languageOption = await withTimeout(
        getLanguageByCode(normalizedCode),
        LANGUAGE_LOOKUP_TIMEOUT_MS,
        () => {
          console.warn(
            `[language] getLanguageByCode timed out after ${LANGUAGE_LOOKUP_TIMEOUT_MS}ms.`
          );
        }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        lookupTimedOut = true;
      } else {
        console.error("[language] Failed to resolve language by code", error);
      }
      languageOption = null;
    }
  }

  if (!languageOption || !languageOption.isActive) {
    if (lookupTimedOut && normalizedCode) {
      cookieStore.set(LANGUAGE_COOKIE, normalizedCode, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: ONE_YEAR_IN_SECONDS,
      });

      return {
        code: normalizedCode,
      };
    }

    let fallback = null;
    try {
      fallback = await withTimeout(
        getDefaultLanguage(),
        LANGUAGE_LOOKUP_TIMEOUT_MS,
        () => {
          console.warn(
            `[language] getDefaultLanguage timed out after ${LANGUAGE_LOOKUP_TIMEOUT_MS}ms.`
          );
        }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        fallback = null;
      } else {
        console.error("[language] Failed to resolve default language", error);
        fallback = null;
      }
    }

    if (!fallback) {
      if (normalizedCode) {
        cookieStore.set(LANGUAGE_COOKIE, normalizedCode, {
          path: "/",
          httpOnly: false,
          sameSite: "lax",
          maxAge: ONE_YEAR_IN_SECONDS,
        });
        return { code: normalizedCode };
      }
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
