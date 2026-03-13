import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminSearch } from "@/components/admin-search";
import { SiteShell } from "@/components/site-shell";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={session}
    >
      <div className="flex min-h-screen flex-col">
        <header className="border-b bg-background px-4 py-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col pr-16 sm:pr-0">
              <h1 className="font-semibold text-lg">Admin Console</h1>
            </div>
            <div className="flex w-full items-center justify-between sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
              <AdminNav />
              <AdminSearch />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </SiteShell>
  );
}
