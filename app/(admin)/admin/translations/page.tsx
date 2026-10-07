import Link from "next/link";
import {
  AdminPageHeader,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  listTranslationEntries,
  type TranslationTableEntry,
} from "@/lib/db/queries";
import { registerTranslationKeys } from "@/lib/i18n/dictionary";
import { getAllLanguages, type LanguageOption } from "@/lib/i18n/languages";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";
import { TranslationSearchForm } from "./translation-search-form";
import {
  PublishTranslationsForm,
  type SectionDefinition,
  SelectedTranslationSection,
  TRANSLATION_PAGE_SIZE,
  type TranslationSectionGroup,
  TranslationSectionNavigation,
  TranslationSummary,
  TranslationsEmpty,
  TranslationsWarning,
} from "./translations-view";

const TRANSLATION_SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: "forum",
    label: "Forum Page",
    description: "Thread listings, discussion composer, and community UI copy.",
    prefixes: ["forum."],
  },
  {
    id: "home",
    label: "Home Page",
    description: "Landing hero, feature highlights, and CTA blocks.",
    prefixes: ["home.", "landing.", "hero.", "greeting."],
  },
  {
    id: "auth",
    label: "Authentication",
    description: "Login, registration, and password reset flows.",
    prefixes: ["auth.", "login.", "register.", "complete_profile."],
  },
  {
    id: "profile",
    label: "Profile & User Menu",
    description: "Profile forms, account settings, and user dropdown copy.",
    prefixes: ["profile.", "user_menu.", "settings."],
  },
  {
    id: "billing",
    label: "Billing & Subscriptions",
    description: "Subscriptions dashboard, recharge flows, and billing UI.",
    prefixes: ["subscriptions.", "recharge.", "billing."],
  },
  {
    id: "chat",
    label: "Chat & Response Generation",
    description:
      "Chat controls, thinking and reasoning labels, voice states, and live response progress.",
    prefixes: ["chat.", "voice.", "news."],
  },
  {
    id: "image",
    label: "Image Generation",
    description: "Chat image generation labels, prompts, and states.",
    prefixes: ["image."],
  },
  {
    id: "about",
    label: "About & Contact",
    description: "About page sections and contact form labels.",
    prefixes: ["about.", "contact."],
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    description: "Privacy policy headings and paragraphs.",
    prefixes: ["privacy."],
  },
  {
    id: "terms",
    label: "Terms of Service",
    description: "Terms of service content blocks.",
    prefixes: ["terms."],
  },
];

const FALLBACK_SECTION: SectionDefinition = {
  id: "general",
  label: "Shared & Other",
  description:
    "Strings that are reused across multiple pages or not yet categorized.",
  prefixes: [],
};

export const dynamic = "force-dynamic";

// Static definitions only change with a deploy, so sync them once per server
// instance instead of on every visit. A failed sync is retried next visit.
let staticKeysRegistration: Promise<void> | null = null;

function ensureStaticTranslationKeysRegistered() {
  staticKeysRegistration ??= registerTranslationKeys(
    STATIC_TRANSLATION_DEFINITIONS
  ).catch((error) => {
    staticKeysRegistration = null;
    throw error;
  });
  return staticKeysRegistration;
}

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const staticKeysState = await adminQueryResult({
    fallback: null,
    label: "translations.register-static-keys",
    promise: ensureStaticTranslationKeysRegistered(),
    timeoutMs: 3000,
  });
  const [languagesState, entriesState] = await Promise.all([
    adminQueryResult({
      fallback: [] as LanguageOption[],
      label: "translations.languages",
      promise: getAllLanguages(),
    }),
    adminQueryResult({
      fallback: [] as TranslationTableEntry[],
      label: "translations.entries",
      promise: listTranslationEntries(),
    }),
  ]);
  const languages = languagesState.data;
  const entries = entriesState.data;

  const queryParam = resolvedSearchParams?.q;
  const rawQuery = Array.isArray(queryParam)
    ? (queryParam[0] ?? "")
    : typeof queryParam === "string"
      ? queryParam
      : "";
  const searchQuery = rawQuery.trim().toLowerCase();

  const activeLanguages = languages.filter((language) => language.isActive);
  const nonDefaultLanguages = activeLanguages.filter(
    (language) => !language.isDefault
  );
  const filteredEntries =
    searchQuery.length > 0
      ? entries.filter((entry) => matchesQuery(entry, searchQuery))
      : entries;
  const sectionGroups =
    filteredEntries.length > 0 ? organizeEntriesBySection(filteredEntries) : [];
  const sectionParam = resolvedSearchParams?.section;
  const rawSectionId = Array.isArray(sectionParam)
    ? (sectionParam[0] ?? "")
    : typeof sectionParam === "string"
      ? sectionParam
      : "";
  const pageParam = resolvedSearchParams?.page;
  const requestedPage = Math.max(
    1,
    Number.parseInt(
      Array.isArray(pageParam)
        ? (pageParam[0] ?? "1")
        : (pageParam ?? "1"),
      10
    ) || 1
  );
  const selectedSection =
    sectionGroups.find((section) => section.id === rawSectionId) ??
    sectionGroups[0] ??
    null;
  const totalSectionEntries = selectedSection?.entries.length ?? 0;
  const totalSectionPages = Math.max(
    1,
    Math.ceil(totalSectionEntries / TRANSLATION_PAGE_SIZE)
  );
  const sectionPage = Math.min(requestedPage, totalSectionPages);
  const pagedSectionEntries = selectedSection
    ? selectedSection.entries.slice(
        (sectionPage - 1) * TRANSLATION_PAGE_SIZE,
        sectionPage * TRANSLATION_PAGE_SIZE
      )
    : [];

  const entriesUsable = entriesState.ok && languagesState.ok;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        actions={<PublishTranslationsForm disabled={!entriesUsable} />}
        description="Manage default English copy and provide localized text. Leave a translation blank to fall back to the English text. New strings wrapped in the translation helper appear here automatically."
        meta={
          entriesState.ok ? (
            <AdminStatusPill>{`${entries.length.toLocaleString()} strings`}</AdminStatusPill>
          ) : null
        }
        navHref="/admin/translations"
        title="Translations"
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b p-4">
          <TranslationSearchForm defaultValue={rawQuery} />
        </div>
        <TranslationSummary
          entriesConfirmed={entriesState.ok}
          languagesConfirmed={languagesState.ok}
          languages={activeLanguages}
          searchQuery={searchQuery}
          totalEntries={entries.length}
          visibleEntries={filteredEntries.length}
        />
      </section>

      {(!staticKeysState.ok || !languagesState.ok || !entriesState.ok) && (
        <TranslationsWarning
          message={[
            !staticKeysState.ok
              ? "Static translation key registration failed."
              : null,
            !languagesState.ok ? "Languages could not be confirmed." : null,
            !entriesState.ok ? "Translation rows could not be confirmed." : null,
          ]
            .filter((message): message is string => Boolean(message))
            .join(" ")}
        />
      )}

      {!entriesState.ok ? (
        <TranslationsEmpty title="Unable to load translation keys">
          Refresh this admin section to retry.
        </TranslationsEmpty>
      ) : entries.length === 0 ? (
        <TranslationsEmpty title="No translation keys have been registered yet">
          Introduce translations in your components using the translation
          helper to populate this list.
        </TranslationsEmpty>
      ) : filteredEntries.length === 0 ? (
        <TranslationsEmpty title={`No translations matched “${rawQuery.trim()}”`}>
          Try a different search term or{" "}
          <Link className="cursor-pointer underline" data-nav href="/admin/translations">
            clear the search
          </Link>
          .
        </TranslationsEmpty>
      ) : (
        <>
          <TranslationSectionNavigation
            activeSectionId={selectedSection?.id ?? null}
            searchQuery={rawQuery}
            sections={sectionGroups}
          />
          <SelectedTranslationSection
            nonDefaultLanguages={nonDefaultLanguages}
            page={sectionPage}
            searchParams={resolvedSearchParams}
            section={selectedSection}
            visibleEntries={pagedSectionEntries}
          />
        </>
      )}
    </div>
  );
}

function organizeEntriesBySection(
  entries: TranslationTableEntry[]
): TranslationSectionGroup[] {
  const definitions = [...TRANSLATION_SECTION_DEFINITIONS, FALLBACK_SECTION];
  const sectionMap = new Map<string, TranslationSectionGroup>();

  for (const definition of definitions) {
    sectionMap.set(definition.id, { ...definition, entries: [] });
  }

  for (const entry of entries) {
    const matchedSection =
      TRANSLATION_SECTION_DEFINITIONS.find((definition) =>
        definition.prefixes.some((prefix) => entry.key.startsWith(prefix))
      ) ?? FALLBACK_SECTION;

    sectionMap.get(matchedSection.id)?.entries.push(entry);
  }

  return definitions
    .map((definition) => sectionMap.get(definition.id))
    .filter(Boolean) as TranslationSectionGroup[];
}

function matchesQuery(entry: TranslationTableEntry, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystacks = [
    entry.key,
    entry.defaultText ?? "",
    entry.description ?? "",
    ...Object.values(entry.translations).map(
      (translation) => translation.value ?? ""
    ),
  ];

  return haystacks.some((text) => (text ?? "").toLowerCase().includes(query));
}
