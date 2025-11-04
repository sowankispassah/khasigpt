import {
  listTranslationEntries,
  type TranslationTableEntry,
} from "@/lib/db/queries";
import {
  getAllLanguages,
  type LanguageOption,
} from "@/lib/i18n/languages";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionSubmitButton } from "@/components/action-submit-button";

import {
  publishTranslationsAction,
  saveDefaultTextAction,
  saveTranslationValueAction,
} from "./translation-actions";

export const dynamic = "force-dynamic";

export default async function AdminTranslationsPage() {
  const [languages, entries] = await Promise.all([
    getAllLanguages(),
    listTranslationEntries(),
  ]);

  const activeLanguages = languages.filter((language) => language.isActive);
  const nonDefaultLanguages = activeLanguages.filter(
    (language) => !language.isDefault
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold">Translations</h1>
        <p className="text-muted-foreground text-sm">
          Manage default English copy and provide localized text. Leave a
          translation blank to fall back to the English text. Need to wire a new
          string? Wrap it in the translation helper and it will appear here
          automatically.
        </p>
      </header>

      <TranslationSummary
        languages={activeLanguages}
        totalEntries={entries.length}
      />

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center text-muted-foreground">
          No translation keys have been registered yet. Introduce translations
          in your components using the translation helper to populate this list.
        </div>
      ) : (
        <TranslationTable
          entries={entries}
          nonDefaultLanguages={nonDefaultLanguages}
        />
      )}
    </div>
  );
}

function TranslationSummary({
  languages,
  totalEntries,
}: {
  languages: LanguageOption[];
  totalEntries: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-background p-4 text-sm">
      <div className="flex flex-col">
        <span className="font-semibold text-base">
          {totalEntries} registered {totalEntries === 1 ? "string" : "strings"}
        </span>
        <span className="text-muted-foreground">
          {languages.length} active {languages.length === 1 ? "language" : "languages"}
        </span>
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {languages.map((language) => (
            <span
              className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium tracking-wide"
              key={language.id}
            >
              {language.name}
              {language.isDefault ? (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase text-primary-foreground">
                  Default
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <form action={publishTranslationsAction}>
          <ActionSubmitButton
            pendingLabel="Publishing..."
            size="sm"
            type="submit"
            variant="default"
            successMessage="Translations published"
          >
            Publish translations
          </ActionSubmitButton>
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
          <tr className="border-b bg-muted/50 text-sm text-muted-foreground">
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
            <tr key={entry.keyId} className="align-top">
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
                    <ActionSubmitButton
                      pendingLabel="Saving..."
                      size="sm"
                      type="submit"
                      variant="outline"
                      successMessage="Default text saved"
                    >
                      Save
                    </ActionSubmitButton>
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
                  <td className="px-4 py-4" key={`${entry.keyId}-${language.id}`}>
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
                        <ActionSubmitButton
                          pendingLabel="Saving..."
                          size="sm"
                          type="submit"
                          variant="outline"
                          successMessage={
                            translation?.value
                              ? `${language.name} translation saved`
                              : `${language.name} translation cleared (falls back to English)`
                          }
                        >
                          {translation?.value ? "Update" : "Save"}
                        </ActionSubmitButton>
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
