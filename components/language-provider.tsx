"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/navigation";

import type { LanguageOption } from "@/lib/i18n/languages";
import { setPreferredLanguageAction } from "@/app/actions/language";

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
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default noop
  setLanguage: () => {},
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
  const [isPending, startTransition] = useTransition();

  const translate = useCallback(
    (key: string, defaultText: string) => {
      return dictionary[key] ?? defaultText;
    },
    [dictionary]
  );

  const setLanguage = useCallback(
    (code: string) => {
      if (code === activeLanguage.code) {
        return;
      }

      startTransition(() => {
        void (async () => {
          await setPreferredLanguageAction(code);
          router.refresh();
        })();
      });
    },
    [activeLanguage.code, router]
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
