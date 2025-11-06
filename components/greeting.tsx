"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/components/language-provider";

export const Greeting = () => {
  const { translate } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer =
      typeof window !== "undefined"
        ? window.setTimeout(() => setIsVisible(true), 50)
        : undefined;

    return () => {
      if (typeof timer === "number") {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const baseClasses =
    "transition-all duration-500 ease-out will-change-transform";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center sm:gap-3" key="overview">
      <div
        className={`${baseClasses} font-semibold text-xl md:text-2xl ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      >
        {translate("greeting.title", "Hello there!")}
      </div>
      <div
        className={`${baseClasses} text-xl text-muted-foreground md:text-2xl delay-75 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      >
        {translate("greeting.subtitle", "How can I help you today?")}
      </div>
    </div>
  );
};
