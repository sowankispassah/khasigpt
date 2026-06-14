import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import { SiteShell } from "@/components/site-shell";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export default async function ForumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cookieStore, session] = await Promise.all([cookies(), auth()]);
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={session ?? null}
    >
      {children}
    </SiteShell>
  );
}
