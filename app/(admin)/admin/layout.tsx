import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { AdminNav } from "@/components/admin-nav";
import { AdminSearch } from "@/components/admin-search";
import { SiteShell } from "@/components/site-shell";
import {
  getTranslationsForKeys,
  type TranslationDefinition,
} from "@/lib/i18n/dictionary";
import type { LanguageOption } from "@/lib/i18n/languages";
import { resolveLanguage } from "@/lib/i18n/languages";
import { withTimeout } from "@/lib/utils/async";

const ADMIN_SHELL_TRANSLATIONS: TranslationDefinition[] = [
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
    defaultText: "No active plan",
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
];

const ADMIN_SHELL_DATA_TIMEOUT_MS = 2500;
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
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [{ languages, activeLanguage }, dictionary] = await Promise.all([
    withTimeout(
      resolveLanguage(preferredLanguage),
      ADMIN_SHELL_DATA_TIMEOUT_MS
    ).catch((error) => {
      console.error("[admin/layout] Language shell data timed out.", error);
      return {
        languages: [FALLBACK_LANGUAGE],
        activeLanguage: FALLBACK_LANGUAGE,
      };
    }),
    withTimeout(
      getTranslationsForKeys(preferredLanguage, ADMIN_SHELL_TRANSLATIONS),
      ADMIN_SHELL_DATA_TIMEOUT_MS
    ).catch((error) => {
      console.error("[admin/layout] Dictionary shell data timed out.", error);
      return buildFallbackDictionary();
    }),
  ]);

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
