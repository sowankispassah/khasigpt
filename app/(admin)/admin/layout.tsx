import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminSearch } from "@/components/admin-search";
import { SiteShell } from "@/components/site-shell";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { adminQueryOr } from "@/lib/admin/safe-query";
import { getUnviewedAccountDeletionRequestCount } from "@/lib/db/queries";
import type { LanguageOption } from "@/lib/i18n/languages";

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
  { key: "user_menu.creator_dashboard", defaultText: "Creator dashboard" },
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
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";
  const languages = [FALLBACK_LANGUAGE];
  const activeLanguage = FALLBACK_LANGUAGE;
  const dictionary = buildFallbackDictionary();
  const accountDeletionRequestCount = await adminQueryOr({
    fallback: 0,
    label: "admin-shell.account-deletion-unviewed-count",
    promise: getUnviewedAccountDeletionRequestCount(),
    timeoutMs: 1500,
  });

  return (
    <SiteShell
      activeLanguage={activeLanguage}
      dictionary={dictionary}
      languages={languages}
      session={session}
    >
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AdminNav
          initialBadgeCounts={{
            accountDeletionRequests: accountDeletionRequestCount,
          }}
        />
        <SidebarInset>
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-20 border-b bg-background/95 py-3 pr-16 pl-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:pr-20 sm:pl-6">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <SidebarTrigger
                    aria-label="Toggle admin sidebar"
                    className="shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <h1 className="truncate font-semibold text-lg">
                      Admin Console
                    </h1>
                  </div>
                </div>
                <AdminSearch />
              </div>
            </header>
            <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SiteShell>
  );
}
