"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { useTranslation } from "@/components/language-provider";

export const Greeting = () => {
  const { translate } = useTranslation();
  const { data: session } = useSession();
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

  const firstName =
    typeof session?.user?.firstName === "string"
      ? session.user.firstName.trim()
      : "";

  const greetingTemplate = translate("greeting.title", "Hi, {name}");
  const greetingTitle = firstName
    ? greetingTemplate.replaceAll("{name}", firstName)
    : greetingTemplate
        .replaceAll("{name}", "")
        .replace(/\s{2,}/g, " ")
        .replace(/(^[,\s]+|[,\s]+$)/g, "")
        .trim();

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center sm:gap-3"
      key="overview"
    >
      <div
        className={`${baseClasses} font-semibold text-xl md:text-2xl ${isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {greetingTitle}
      </div>
      <div
        className={`${baseClasses} text-muted-foreground text-xl delay-75 md:text-2xl ${isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {translate("greeting.subtitle", "How can I help you today?")}
      </div>
    </div>
  );
};
