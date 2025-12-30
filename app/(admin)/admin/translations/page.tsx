import type { ComponentProps } from "react";
import Link from "next/link";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listTranslationEntries,
  type TranslationTableEntry,
} from "@/lib/db/queries";
import { registerTranslationKeys } from "@/lib/i18n/dictionary";
import { getAllLanguages, type LanguageOption } from "@/lib/i18n/languages";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";
import {
  publishTranslationsAction,
  saveDefaultTextAction,
  saveTranslationValueAction,
} from "./translation-actions";
import { TranslationSearchForm } from "./translation-search-form";

const TRANSLATION_PENDING_TIMEOUT_MS = 12000;

function TranslationSubmitButton(
  props: ComponentProps<typeof ActionSubmitButton>
) {
  return (
    <ActionSubmitButton
      pendingTimeoutMs={TRANSLATION_PENDING_TIMEOUT_MS}
      {...props}
    />
  );
}

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

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  await registerTranslationKeys(STATIC_TRANSLATION_DEFINITIONS);
  const [languages, entries] = await Promise.all([
    getAllLanguages(),
    listTranslationEntries(),
  ]);

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

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="font-semibold text-2xl">Translations</h1>
        <p className="text-muted-foreground text-sm">
          Manage default English copy and provide localized text. Leave a
          translation blank to fall back to the English text. Need to wire a new
          string? Wrap it in the translation helper and it will appear here
          automatically.
        </p>
      </header>

      <TranslationSearchForm defaultValue={rawQuery} />

      <TranslationSummary
        languages={activeLanguages}
        searchQuery={searchQuery}
        totalEntries={entries.length}
        visibleEntries={filteredEntries.length}
      />

      {entries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-muted/40 p-8 text-center text-muted-foreground">
          No translation keys have been registered yet. Introduce translations
          in your components using the translation helper to populate this list.
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed bg-muted/40 p-8 text-center text-muted-foreground">
          No translations matched{" "}
          <span className="font-semibold">“{rawQuery.trim()}”</span>. Try a
          different search term or{" "}
          <Link className="underline" href="/admin/translations">
            clear the search
          </Link>
          .
        </div>
      ) : (
        <>
          <TranslationSectionNavigation sections={sectionGroups} />
          <TranslationSections
            nonDefaultLanguages={nonDefaultLanguages}
            sections={sectionGroups}
          />
        </>
      )}
    </div>
  );
}

function TranslationSummary({
  languages,
  visibleEntries,
  totalEntries,
  searchQuery,
}: {
  languages: LanguageOption[];
  visibleEntries: number;
  totalEntries: number;
  searchQuery: string;
}) {
  const showingLabel =
    searchQuery.trim().length > 0 && totalEntries > 0
      ? `Showing ${visibleEntries} of ${totalEntries} string${
          totalEntries === 1 ? "" : "s"
        }`
      : `${totalEntries} registered ${
          totalEntries === 1 ? "string" : "strings"
        }`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-col">
        <span className="font-semibold text-base">{showingLabel}</span>
        <span className="text-muted-foreground">
          {languages.length} active{" "}
          {languages.length === 1 ? "language" : "languages"}
        </span>
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <span
              className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 font-medium text-xs tracking-wide"
              key={language.id}
            >
              {language.name}
              {language.isDefault ? (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground uppercase">
                  Default
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <form action={publishTranslationsAction}>
          <TranslationSubmitButton
            pendingLabel="Publishing..."
            size="sm"
            successMessage="Translations published"
            type="submit"
            variant="default"
          >
            Publish translations
          </TranslationSubmitButton>
        </form>
      </div>
    </div>
  );
}

function TranslationTable({
  entries,
  nonDefaultLanguages,
}: {
  entries: TranslationTableEntry[];
  nonDefaultLanguages: LanguageOption[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-b bg-muted/50 text-muted-foreground text-sm">
            <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wide">
              Key
            </th>
            <th className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wide">
              English (default)
            </th>
            {nonDefaultLanguages.map((language) => (
              <th
                className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wide"
                key={language.id}
              >
                {language.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr className="align-top" key={entry.keyId}>
              <td className="whitespace-nowrap px-4 py-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{entry.key}</span>
                  {entry.description ? (
                    <span className="text-muted-foreground text-xs">
                      {entry.description}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-4">
                <form
                  action={saveDefaultTextAction}
                  className="flex flex-col gap-2 text-sm"
                >
                  <input name="keyId" type="hidden" value={entry.keyId} />
                  <Textarea
                    defaultValue={entry.defaultText}
                    name="defaultText"
                    rows={3}
                  />
                  <Input
                    defaultValue={entry.description ?? ""}
                    name="description"
                    placeholder="Optional description"
                  />
                  <div className="flex items-center gap-2">
                    <TranslationSubmitButton
                      pendingLabel="Saving..."
                      size="sm"
                      successMessage="Default text saved"
                      type="submit"
                      variant="outline"
                    >
                      Save
                    </TranslationSubmitButton>
                    <span className="text-muted-foreground text-xs">
                      Updated{" "}
                      {entry.updatedAt
                        ? entry.updatedAt.toLocaleString()
                        : "never"}
                    </span>
                  </div>
                </form>
              </td>
              {nonDefaultLanguages.map((language) => {
                const translation = entry.translations[language.code];
                return (
                  <td
                    className="px-4 py-4"
                    key={`${entry.keyId}-${language.id}`}
                  >
                    <form
                      action={saveTranslationValueAction}
                      className="flex flex-col gap-2 text-sm"
                    >
                      <input name="keyId" type="hidden" value={entry.keyId} />
                      <input
                        name="languageCode"
                        type="hidden"
                        value={language.code}
                      />
                      <Textarea
                        defaultValue={translation?.value ?? ""}
                        name="translationValue"
                        placeholder={`Enter ${language.name} translation`}
                        rows={3}
                      />
                      <div className="flex items-center gap-2">
                        <TranslationSubmitButton
                          pendingLabel="Saving..."
                          size="sm"
                          successMessage={
                            translation?.value
                              ? `${language.name} translation saved`
                              : `${language.name} translation cleared (falls back to English)`
                          }
                          type="submit"
                          variant="outline"
                        >
                          {translation?.value ? "Update" : "Save"}
                        </TranslationSubmitButton>
                        <span className="text-muted-foreground text-xs">
                          {translation?.updatedAt
                            ? `Updated ${translation.updatedAt.toLocaleString()}`
                            : "Not provided"}
                        </span>
                      </div>
                    </form>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SectionDefinition = {
  id: string;
  label: string;
  description?: string;
  prefixes: string[];
};

type TranslationSectionGroup = SectionDefinition & {
  entries: TranslationTableEntry[];
};

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

function TranslationSectionNavigation({
  sections,
}: {
  sections: TranslationSectionGroup[];
}) {
  return (
    <nav className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        Jump to section
      </p>
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-3 py-1 font-medium text-foreground text-xs transition hover:border-primary/40 hover:text-primary"
            href={`#translation-section-${section.id}`}
            key={section.id}
          >
            {section.label}
            <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] text-muted-foreground uppercase">
              {section.entries.length}
            </span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function TranslationSections({
  sections,
  nonDefaultLanguages,
}: {
  sections: TranslationSectionGroup[];
  nonDefaultLanguages: LanguageOption[];
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const isForumSection = section.id === "forum";
        const hasEntries = section.entries.length > 0;

        return (
          <details
            className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            id={`translation-section-${section.id}`}
            key={section.id}
            {...(isForumSection ? { open: true } : {})}
          >
            <summary className="flex cursor-pointer flex-col gap-1 bg-muted/40 px-4 py-3 font-semibold text-foreground text-sm outline-none transition hover:bg-muted">
              <div className="flex items-center justify-between gap-2">
                <span>{section.label}</span>
                <span className="font-normal text-muted-foreground text-xs">
                  {section.entries.length}{" "}
                  {section.entries.length === 1 ? "string" : "strings"}
                </span>
              </div>
              {section.description ? (
                <span className="font-normal text-muted-foreground text-xs">
                  {section.description}
                </span>
              ) : null}
            </summary>
            <div className="border-border border-t">
              {hasEntries ? (
                <div className="p-4">
                  <TranslationTable
                    entries={section.entries}
                    nonDefaultLanguages={nonDefaultLanguages}
                  />
                </div>
              ) : (
                <p className="px-4 py-6 text-muted-foreground text-sm">
                  No translations have been registered for this section yet.
                  Wrap copy in the translation helper using the suggested prefix{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-foreground text-xs">
                    {section.prefixes[0] ?? "general."}
                  </code>{" "}
                  to populate this table.
                </p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
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
