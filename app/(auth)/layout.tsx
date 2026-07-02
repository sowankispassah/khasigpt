import { cookies } from "next/headers";
import { SiteShell } from "@/components/site-shell";
import { getAuthFallbackTranslationBundle } from "@/lib/i18n/auth-fallback-bundle";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { languages, activeLanguage, dictionary } =
    getAuthFallbackTranslationBundle(preferredLanguage);

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={null}
    >
      {children}
    </SiteShell>
  );
}
