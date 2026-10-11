"use client";

import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminNotice, AdminPanel } from "@/components/admin/admin-ui";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { JobsScrapeRunnerMode } from "@/lib/jobs/schedule";

const OPTION_CLASS =
  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:bg-muted/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

export function AdminJobsRunnerModeControl({
  action,
  mode,
  unavailable,
}: {
  action: (formData: FormData) => Promise<void>;
  mode: JobsScrapeRunnerMode;
  unavailable: boolean;
}) {
  const { translate } = useTranslation();

  return (
    <AdminPanel
      bodyClassName="p-5"
      description={
        <EditableTranslation
          translationKey="admin.jobs.runner.description"
          defaultText="Choose which schedule starts job imports. The jobs list and source settings work with either choice."
          description="Explanation of the admin jobs runner mode setting."
        />
      }
      title={
        <EditableTranslation
          translationKey="admin.jobs.runner.title"
          defaultText="Automatic Jobs Runner"
          description="Heading for choosing the automatic jobs import runner."
        />
      }
    >
      {unavailable ? (
        <AdminNotice className="mb-4">
          <EditableTranslation
            translationKey="admin.jobs.runner.unavailable"
            defaultText="The current runner could not be confirmed. Refresh before changing it."
            description="Error shown when the jobs runner mode setting is unavailable."
          />
        </AdminNotice>
      ) : null}
      <form action={action}>
        <fieldset className="space-y-3" disabled={unavailable}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={OPTION_CLASS}>
              <input
                className="mt-1 cursor-pointer"
                defaultChecked={mode === "project"}
                name="runnerMode"
                type="radio"
                value="project"
              />
              <span className="space-y-1">
                <span className="block font-medium text-sm">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.project"
                    defaultText="Project schedule"
                    description="Label for the site's built-in jobs import schedule."
                  />
                </span>
                <span className="block text-muted-foreground text-xs">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.project_details"
                    defaultText="The site runs its configured automatic scraper."
                    description="Description of the project jobs runner mode."
                  />
                </span>
              </span>
            </label>
            <label className={OPTION_CLASS}>
              <input
                className="mt-1 cursor-pointer"
                defaultChecked={mode === "chatgpt"}
                name="runnerMode"
                type="radio"
                value="chatgpt"
              />
              <span className="space-y-1">
                <span className="block font-medium text-sm">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.chatgpt"
                    defaultText="ChatGPT app schedule"
                    description="Label for the ChatGPT desktop jobs import schedule."
                  />
                </span>
                <span className="block text-muted-foreground text-xs">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.chatgpt_codex_details"
                    defaultText="The ChatGPT desktop task finds jobs on the web at its scheduled time or when you press Run now. KhasiGPT only validates and saves the listings; its web scraper and Google PDF extraction are not used."
                    description="Description of the Codex-gathered jobs runner mode."
                  />
                </span>
              </span>
            </label>
          </div>
          <ActionSubmitButton
            className="cursor-pointer"
            disabled={unavailable}
            pendingLabel={translate("admin.jobs.runner.saving", "Saving runner...")}
            refreshOnSuccess
            successMessage={translate("admin.jobs.runner.saved", "Jobs runner saved.")}
          >
            <EditableTranslation
              translationKey="admin.jobs.runner.save"
              defaultText="Save Runner"
              description="Button for saving the selected automatic jobs runner."
            />
          </ActionSubmitButton>
        </fieldset>
      </form>
    </AdminPanel>
  );
}
