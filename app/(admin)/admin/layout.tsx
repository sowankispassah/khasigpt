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
    >
      <div className="flex min-h-screen flex-col">
        <header className="border-b bg-background px-6 py-4">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col">
              <h1 className="font-semibold text-lg">Admin Console</h1>
              <p className="text-muted-foreground text-sm">
                Manage users, models, and infrastructure activity
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
