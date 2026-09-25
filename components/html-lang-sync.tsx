"use client";

import { useEffect } from "react";
import { useTranslation } from "@/components/language-provider";

export function HtmlLangSync() {
  const { activeLanguage } = useTranslation();

  useEffect(() => {
    if (activeLanguage?.code) {
      document.documentElement.lang = activeLanguage.code;
    }
  }, [activeLanguage?.code]);

  return null;
}
