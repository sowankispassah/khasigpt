import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPreloader } from "@/components/chat-preloader";
import { SiteShell } from "@/components/site-shell";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getUserById } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { withTimeout } from "@/lib/utils/async";
import { auth } from "../(auth)/auth";

const profileLookupTimeoutRaw = Number.parseInt(
  process.env.PROFILE_LOOKUP_TIMEOUT_MS ?? "1200",
  10
);
const PROFILE_LOOKUP_TIMEOUT_MS =
  Number.isFinite(profileLookupTimeoutRaw) && profileLookupTimeoutRaw > 0
    ? profileLookupTimeoutRaw
    : 1200;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const profileUser = session?.user ?? null;

  if (profileUser) {
    const needsProfileDetails =
      !profileUser.dateOfBirth ||
      !profileUser.firstName ||
      !profileUser.lastName;
    if (needsProfileDetails) {
      const dbUser = await withTimeout(
        getUserById(profileUser.id),
        PROFILE_LOOKUP_TIMEOUT_MS
      ).catch(() => null);
      const hasCompletedProfile = Boolean(
        (dbUser?.dateOfBirth ?? profileUser.dateOfBirth) &&
          (dbUser?.firstName ?? profileUser.firstName) &&
          (dbUser?.lastName ?? profileUser.lastName)
      );
      if (!hasCompletedProfile) {
        redirect("/complete-profile");
      }
    }
  }

  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";
  const { languages, activeLanguage, dictionary } =
    await getTranslationBundle(preferredLanguage);

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={session ?? undefined}
    >
      {session ? (
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <ChatPreloader />
          <AppSidebar user={session.user} />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      ) : (
        children
      )}
    </SiteShell>
  );
}
