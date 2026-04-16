import type { Session } from "next-auth";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { LanguageProvider } from "@/components/language-provider";
import { SessionShell } from "@/components/session-shell";
import { SiteShellExtras } from "@/components/site-shell-extras";
import type { LanguageOption } from "@/lib/i18n/languages";

type SiteShellProps = {
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
  languages: LanguageOption[];
  children: React.ReactNode;
  forumEnabled?: boolean;
  session?: Session | null;
};

export function SiteShell({
  activeLanguage,
  dictionary,
  languages,
  children,
  forumEnabled = true,
  session,
}: SiteShellProps) {
  return (
    <SessionShell session={session}>
      <LanguageProvider
        activeLanguage={activeLanguage}
        dictionary={dictionary}
        languages={languages}
      >
        <HtmlLangSync />
        <SiteShellExtras
          forumEnabled={forumEnabled}
          sessionUser={session?.user ?? null}
        />
        {children}
      </LanguageProvider>
    </SessionShell>
  );
}
