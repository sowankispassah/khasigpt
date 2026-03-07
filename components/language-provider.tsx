"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { setPreferredLanguageAction } from "@/app/actions/language";
import type { LanguageOption } from "@/lib/i18n/languages";

type TranslationContextValue = {
  languages: LanguageOption[];
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
  translate: (key: string, defaultText: string) => string;
  setLanguage: (code: string) => void;
  isUpdating: boolean;
};

const TranslationContext = createContext<TranslationContextValue>({
  languages: [],
  activeLanguage: {
    id: "",
    code: "en",
    name: "English",
    isDefault: true,
    isActive: true,
    syncUiLanguage: false,
  },
  dictionary: {},
  translate: (_key, defaultText) => defaultText,
  setLanguage: () => {
    // default noop
    return;
  }, // default noop
  isUpdating: false,
});

type LanguageProviderProps = PropsWithChildren<{
  languages: LanguageOption[];
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
}>;

export function LanguageProvider({
  languages,
  activeLanguage,
  dictionary,
  children,
}: LanguageProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, setIsPending] = useState(false);
  const languageCodeSet = useMemo(() => {
    const codes = new Set<string>();
    for (const language of languages) {
      codes.add(language.code);
    }
    if (activeLanguage?.code) {
      codes.add(activeLanguage.code);
    }
    return codes;
  }, [languages, activeLanguage?.code]);

  const translate = useCallback(
    (key: string, defaultText: string) => {
      return dictionary[key] ?? defaultText;
    },
    [dictionary]
  );

  const setLanguage = useCallback(
    (code: string) => {
      const normalized = typeof code === "string" ? code.trim().toLowerCase() : "";
      if (!normalized || normalized === activeLanguage.code) {
        return;
      }

      setIsPending(true);
      void (async () => {
        try {
          if (typeof document !== "undefined") {
            const encoded = encodeURIComponent(normalized);
            document.cookie = `lang=${encoded}; path=/; max-age=${
              60 * 60 * 24 * 365
            }; samesite=lax`;
          }

          await setPreferredLanguageAction(normalized);
        } catch (error) {
          console.error("[language/provider] Failed to persist language choice.", error);
        } finally {
          if (pathname) {
            const segments = pathname.split("/").filter(Boolean);
            if (segments.length > 0 && languageCodeSet.has(segments[0])) {
              segments[0] = normalized;
              const nextPath = `/${segments.join("/")}`;
              const querySuffix =
                typeof window !== "undefined" ? window.location.search ?? "" : "";
              router.replace(`${nextPath}${querySuffix}`);
              setIsPending(false);
              return;
            }
          }

          router.refresh();
          window.setTimeout(() => {
            setIsPending(false);
          }, 300);
        }
      })();
    },
    [activeLanguage.code, languageCodeSet, pathname, router]
  );

  const value = useMemo<TranslationContextValue>(
    () => ({
      languages,
      activeLanguage,
      dictionary,
      translate,
      setLanguage,
      isUpdating: isPending,
    }),
    [languages, activeLanguage, dictionary, translate, setLanguage, isPending]
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  return useContext(TranslationContext);
}
