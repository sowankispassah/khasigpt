import { LanguageProvider } from "@/components/language-provider";
import { PageUserMenu } from "@/components/page-user-menu";
import { HtmlLangSync } from "@/components/html-lang-sync";
import type { LanguageOption } from "@/lib/i18n/languages";

type SiteShellProps = {
  activeLanguage: LanguageOption;
  dictionary: Record<string, string>;
  languages: LanguageOption[];
  children: React.ReactNode;
  forumEnabled?: boolean;
};

export function SiteShell({
  activeLanguage,
  dictionary,
  languages,
  children,
  forumEnabled = true,
}: SiteShellProps) {
  return (
    <LanguageProvider
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
    >
      <HtmlLangSync />
      <PageUserMenu forumEnabled={forumEnabled} />
      {children}
    </LanguageProvider>
  );
}
