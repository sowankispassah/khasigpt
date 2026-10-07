import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminNav } from "@/components/admin-nav";
import { AdminSearch } from "@/components/admin-search";
import { SiteShell } from "@/components/site-shell";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { LanguageOption } from "@/lib/i18n/languages";
import { getAdminRequestSession } from "@/lib/security/admin-session";

const ADMIN_SHELL_TRANSLATIONS = [
  { key: "user_menu.resources", defaultText: "Resources" },
  { key: "user_menu.language", defaultText: "Language" },
  { key: "user_menu.language.active", defaultText: "Active" },
  { key: "user_menu.language.updating", defaultText: "Updating..." },
  {
    key: "user_menu.language.chat_prompt.title",
    defaultText: "Also change chat language?",
  },
  {
    key: "user_menu.language.chat_prompt.description",
    defaultText: "Update the chat language to {language} as well?",
  },
  {
    key: "user_menu.language.chat_prompt.cancel",
    defaultText: "No, keep chat language",
  },
  {
    key: "user_menu.language.chat_prompt.confirm",
    defaultText: "Yes, update chat language",
  },
  {
    key: "user_menu.language.chat_prompt.loading",
    defaultText: "Switching chat language...",
  },
  { key: "user_menu.theme.light", defaultText: "Light mode" },
  { key: "user_menu.theme.dark", defaultText: "Dark mode" },
  { key: "user_menu.sign_out", defaultText: "Sign out" },
  {
    key: "user_menu.manage_subscriptions",
    defaultText: "Manage Subscriptions",
  },
  {
    key: "user_menu.manage_subscriptions_status_checking",
    defaultText: "Checking plan...",
  },
  {
    key: "user_menu.manage_subscriptions_status_fallback",
    defaultText: "Free Plan",
  },
  { key: "user_menu.upgrade_plan", defaultText: "Upgrade plan" },
  { key: "user_menu.open_admin_console", defaultText: "Open admin console" },
  { key: "user_menu.profile", defaultText: "Profile" },
  { key: "user_menu.open_menu", defaultText: "Open menu" },
  { key: "referrals.dashboard_label", defaultText: "Earnings dashboard" },
  { key: "user_menu.community_forum", defaultText: "Community Forum" },
  { key: "user_menu.resources.about", defaultText: "About Us" },
  { key: "user_menu.resources.contact", defaultText: "Contact Us" },
  { key: "user_menu.resources.privacy", defaultText: "Privacy Policy" },
  { key: "user_menu.resources.terms", defaultText: "Terms of Service" },
  {
    key: "chat.language.ui_prompt.loading",
    defaultText: "Switching interface language...",
  },
] as const;

const FALLBACK_LANGUAGE: LanguageOption = {
  id: "fallback-en",
  code: "en",
  name: "English",
  isDefault: true,
  isActive: true,
  syncUiLanguage: true,
};

function buildFallbackDictionary() {
  return Object.fromEntries(
    ADMIN_SHELL_TRANSLATIONS.map((definition) => [
      definition.key,
      definition.defaultText,
    ])
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminRequestSession();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";
  const languages = [FALLBACK_LANGUAGE];
  const activeLanguage = FALLBACK_LANGUAGE;
  const dictionary = buildFallbackDictionary();
  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={session}
    >
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AdminNav />
        <SidebarInset>
          <div className="flex min-h-screen flex-col bg-muted/30">
            {/* Right padding keeps clear of the fixed PageUserMenu avatar. */}
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 pr-24 pl-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:pl-4">
              <SidebarTrigger
                aria-label="Toggle admin sidebar"
                className="shrink-0 cursor-pointer"
              />
              <div aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
              <div className="min-w-0 flex-1">
                <AdminBreadcrumb />
              </div>
              <AdminSearch />
            </header>
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SiteShell>
  );
}
