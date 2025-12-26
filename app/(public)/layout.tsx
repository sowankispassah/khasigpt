import { SiteShell } from "@/components/site-shell";
import { STATIC_TRANSLATION_BUNDLE } from "@/lib/i18n/static-bundle";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SiteShell
      activeLanguage={STATIC_TRANSLATION_BUNDLE.activeLanguage}
      dictionary={STATIC_TRANSLATION_BUNDLE.dictionary}
      languages={STATIC_TRANSLATION_BUNDLE.languages}
    >
      {children}
    </SiteShell>
  );
}
