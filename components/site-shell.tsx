import { HtmlLangSync } from "@/components/html-lang-sync";
import { LanguageProvider } from "@/components/language-provider";
import { PageUserMenu } from "@/components/page-user-menu";
import { SessionShell } from "@/components/session-shell";
import type { LanguageOption } from "@/lib/i18n/languages";
import type { Session } from "next-auth";

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
        <PageUserMenu forumEnabled={forumEnabled} />
        {children}
      </LanguageProvider>
    </SessionShell>
  );
}
