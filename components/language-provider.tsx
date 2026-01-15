"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useTransition,
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
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const search = useMemo(() => searchParams?.toString() ?? "", [searchParams]);
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

      startTransition(() => {
        (async () => {
          await setPreferredLanguageAction(normalized);
          if (pathname) {
            const segments = pathname.split("/").filter(Boolean);
            if (segments.length > 0 && languageCodeSet.has(segments[0])) {
              segments[0] = normalized;
              const nextPath = `/${segments.join("/")}`;
              router.replace(search ? `${nextPath}?${search}` : nextPath);
              return;
            }
          }
          router.refresh();
        })();
      });
    },
    [activeLanguage.code, languageCodeSet, pathname, router, search]
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
