"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

export const Greeting = ({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) => {
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

  const defaultTitle = firstName
    ? translate("greeting.title", "Hi, {name}").replaceAll("{name}", firstName)
    : translate("greeting.title", "Hi, {name}")
        .replaceAll("{name}", "")
        .replace(/\s{2,}/g, " ")
        .replace(/(^[,\s]+|[,\s]+$)/g, "")
        .trim();
  const greetingTitle = title ?? defaultTitle;
  const greetingSubtitle =
    subtitle ?? translate("greeting.subtitle", "How can I help you today?");

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center sm:gap-3"
      key="overview"
    >
      <div
        className={`${baseClasses} font-semibold text-xl md:text-2xl ${isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {title ? (
          greetingTitle
        ) : (
          <EditableTranslation
            defaultText="Hi, {name}"
            description="Greeting headline above the chat input. Use {name} as the placeholder for the user's first name."
            translationKey="greeting.title"
            values={{ name: firstName }}
          />
        )}
      </div>
      <div
        className={`${baseClasses} text-muted-foreground text-xl delay-75 md:text-2xl ${isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {subtitle ? (
          greetingSubtitle
        ) : (
          <EditableTranslation
            defaultText="How can I help you today?"
            description="Secondary greeting line beneath the hero title."
            translationKey="greeting.subtitle"
          />
        )}
      </div>
    </div>
  );
};
