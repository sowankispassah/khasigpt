import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TranslationTableEntry } from "@/lib/db/queries";
import type { LanguageOption } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";
import {
  publishTranslationsAction,
  saveDefaultTextAction,
  saveTranslationValueAction,
} from "./translation-actions";

const TRANSLATION_PENDING_TIMEOUT_MS = 12000;
export const TRANSLATION_PAGE_SIZE = 25;

export type SectionDefinition = {
  id: string;
  label: string;
  description?: string;
  prefixes: string[];
};

export type TranslationSectionGroup = SectionDefinition & {
  entries: TranslationTableEntry[];
};

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

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatUpdated(value: Date | null | undefined) {
  return value ? dateTimeFormatter.format(new Date(value)) : null;
}

export function PublishTranslationsForm({ disabled }: { disabled: boolean }) {
  return (
    <form action={publishTranslationsAction}>
      <TranslationSubmitButton
        disabled={disabled}
        pendingLabel="Publishing..."
        size="sm"
        successMessage="Translations published"
        type="submit"
        variant="default"
      >
        Publish translations
      </TranslationSubmitButton>
    </form>
  );
}

export function TranslationSummary({
  entriesConfirmed,
  languagesConfirmed,
  languages,
  visibleEntries,
  totalEntries,
  searchQuery,
}: {
  entriesConfirmed: boolean;
  languagesConfirmed: boolean;
  languages: LanguageOption[];
  visibleEntries: number;
  totalEntries: number;
  searchQuery: string;
}) {
  const uniqueLanguages = Array.from(
    new Map(languages.map((language) => [language.code, language])).values()
  );
  const showingLabel =
    searchQuery.trim().length > 0 && totalEntries > 0
      ? `Showing ${visibleEntries} of ${totalEntries} string${
          totalEntries === 1 ? "" : "s"
        }`
      : `${totalEntries} registered ${
          totalEntries === 1 ? "string" : "strings"
        }`;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">
          {entriesConfirmed ? showingLabel : "Translation strings unavailable"}
        </span>
        <span className="text-muted-foreground text-xs">
          {languagesConfirmed
            ? `${uniqueLanguages.length} active ${
                uniqueLanguages.length === 1 ? "language" : "languages"
              }`
            : "Active languages unavailable"}
        </span>
      </div>
      <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
        {uniqueLanguages.map((language) => {
          const label =
            language.name?.trim().length > 0
              ? language.name
              : language.code.toUpperCase();
          return (
            <AdminStatusPill
              key={language.id}
              tone={language.isDefault ? "info" : "neutral"}
            >
              {label}
              {language.isDefault ? " · Default" : ""}
            </AdminStatusPill>
          );
        })}
      </div>
    </div>
  );
}

export function TranslationsWarning({ message }: { message: string }) {
  return (
    <AdminNotice>
      {message} Fallback data is not treated as saved translation state.
    </AdminNotice>
  );
}

export function buildTranslationsHref({
  sectionId,
  query,
  page,
}: {
  sectionId: string;
  query: string;
  page: number;
}) {
  const params = new URLSearchParams();
  if (query.trim().length > 0) {
    params.set("q", query.trim());
  }
  params.set("section", sectionId);
  params.set("page", String(page));
  return `/admin/translations?${params.toString()}`;
}

export function TranslationSectionNavigation({
  activeSectionId,
  searchQuery,
  sections,
}: {
  activeSectionId: string | null;
  searchQuery: string;
  sections: TranslationSectionGroup[];
}) {
  return (
    <nav aria-label="Translation sections" className="min-w-0">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {sections.map((section) => {
          const active = section.id === activeSectionId;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 font-medium text-xs transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:border-primary/40 hover:text-primary"
              )}
              data-nav
              href={buildTranslationsHref({
                page: 1,
                query: searchQuery,
                sectionId: section.id,
              })}
              key={section.id}
              prefetch
            >
              {section.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  active
                    ? "bg-primary-foreground/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {section.entries.length}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TranslationsEmpty({
  children,
  title,
}: {
  children?: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card">
      <AdminEmptyState description={children} title={title} />
    </div>
  );
}

function EditorCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-sm", className)}>
      {children}
    </div>
  );
}

function TranslationEntry({
  entry,
  nonDefaultLanguages,
}: {
  entry: TranslationTableEntry;
  nonDefaultLanguages: LanguageOption[];
}) {
  const defaultUpdated = formatUpdated(entry.updatedAt);
  return (
    <article className="px-4 py-4 sm:px-5">
      <div className="mb-3 min-w-0">
        <code className="break-all font-medium font-mono text-[13px]">{entry.key}</code>
        {entry.description ? (
          <p className="mt-0.5 text-muted-foreground text-xs">{entry.description}</p>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <EditorCard>
          <form action={saveDefaultTextAction} className="flex flex-col gap-2">
            <input name="keyId" type="hidden" value={entry.keyId} />
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-xs">English</span>
              <AdminStatusPill tone="info">Default</AdminStatusPill>
            </div>
            <Textarea
              aria-label={`English text for ${entry.key}`}
              className="bg-background"
              defaultValue={entry.defaultText}
              name="defaultText"
              rows={3}
            />
            <Input
              aria-label={`Description for ${entry.key}`}
              className="bg-background"
              defaultValue={entry.description ?? ""}
              name="description"
              placeholder="Optional description"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                Updated {defaultUpdated ?? "never"}
              </span>
              <TranslationSubmitButton
                pendingLabel="Saving..."
                size="sm"
                successMessage="Default text saved"
                type="submit"
                variant="outline"
              >
                Save
              </TranslationSubmitButton>
            </div>
          </form>
        </EditorCard>
        {nonDefaultLanguages.map((language) => {
          const translation = entry.translations[language.code];
          const updated = formatUpdated(translation?.updatedAt);
          return (
            <EditorCard key={`${entry.keyId}-${language.id}`}>
              <form action={saveTranslationValueAction} className="flex flex-col gap-2">
                <input name="keyId" type="hidden" value={entry.keyId} />
                <input name="languageCode" type="hidden" value={language.code} />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">{language.name}</span>
                  {translation?.value ? null : (
                    <AdminStatusPill tone="warning">Uses English</AdminStatusPill>
                  )}
                </div>
                <Textarea
                  aria-label={`${language.name} text for ${entry.key}`}
                  className="bg-background"
                  defaultValue={translation?.value ?? ""}
                  name="translationValue"
                  placeholder={`Enter ${language.name} translation`}
                  rows={3}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">
                    {updated ? `Updated ${updated}` : "Not provided"}
                  </span>
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
                </div>
              </form>
            </EditorCard>
          );
        })}
      </div>
    </article>
  );
}

export function SelectedTranslationSection({
  nonDefaultLanguages,
  section,
  visibleEntries,
  page,
  searchParams,
}: {
  nonDefaultLanguages: LanguageOption[];
  section: TranslationSectionGroup | null;
  visibleEntries: TranslationTableEntry[];
  page: number;
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  if (!section) {
    return null;
  }

  const hasEntries = section.entries.length > 0;

  return (
    <AdminPanel
      action={
        <AdminStatusPill>
          {section.entries.length}{" "}
          {section.entries.length === 1 ? "string" : "strings"}
        </AdminStatusPill>
      }
      description={section.description}
      id={`translation-section-${section.id}`}
      title={section.label}
    >
      {hasEntries ? (
        <>
          <div className="divide-y divide-border/60">
            {visibleEntries.map((entry) => (
              <TranslationEntry
                entry={entry}
                key={entry.keyId}
                nonDefaultLanguages={nonDefaultLanguages}
              />
            ))}
          </div>
          <div className="border-t px-4 py-3">
            <AdminPagination
              itemLabel="translations"
              page={page}
              pageSize={TRANSLATION_PAGE_SIZE}
              pathname="/admin/translations"
              searchParams={searchParams}
              totalItems={section.entries.length}
            />
          </div>
        </>
      ) : (
        <p className="px-5 py-6 text-muted-foreground text-sm">
          No translations have been registered for this section yet. Wrap copy
          in the translation helper using the suggested prefix{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-foreground text-xs">
            {section.prefixes[0] ?? "general."}
          </code>{" "}
          to populate this table.
        </p>
      )}
    </AdminPanel>
  );
}
