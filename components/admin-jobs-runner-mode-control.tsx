"use client";

import { ActionSubmitButton } from "@/components/action-submit-button";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobsScrapeRunnerMode } from "@/lib/jobs/schedule";

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
    <Card>
      <CardHeader>
        <CardTitle>
          <EditableTranslation
            translationKey="admin.jobs.runner.title"
            defaultText="Automatic Jobs Runner"
            description="Heading for choosing the automatic jobs import runner."
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          <EditableTranslation
            translationKey="admin.jobs.runner.description"
            defaultText="Choose which schedule starts job imports. The jobs list and source settings work with either choice."
            description="Explanation of the admin jobs runner mode setting."
          />
        </p>
        {unavailable ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700">
            <EditableTranslation
              translationKey="admin.jobs.runner.unavailable"
              defaultText="The current runner could not be confirmed. Refresh before changing it."
              description="Error shown when the jobs runner mode setting is unavailable."
            />
          </p>
        ) : null}
        <form action={action} className="space-y-3">
          <fieldset className="space-y-3" disabled={unavailable}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
              <input
                className="mt-1 cursor-pointer"
                defaultChecked={mode === "project"}
                name="runnerMode"
                type="radio"
                value="project"
              />
              <span className="space-y-1">
                <span className="block font-medium">
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
            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
              <input
                className="mt-1 cursor-pointer"
                defaultChecked={mode === "chatgpt"}
                name="runnerMode"
                type="radio"
                value="chatgpt"
              />
              <span className="space-y-1">
                <span className="block font-medium">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.chatgpt"
                    defaultText="ChatGPT app schedule"
                    description="Label for the ChatGPT desktop jobs import schedule."
                  />
                </span>
                <span className="block text-muted-foreground text-xs">
                  <EditableTranslation
                    translationKey="admin.jobs.runner.chatgpt_details"
                    defaultText="This computer runs the import at 6:00 AM India time while ChatGPT is open. Site scrapes are blocked."
                    description="Description of the ChatGPT desktop jobs runner mode."
                  />
                </span>
              </span>
            </label>
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
      </CardContent>
    </Card>
  );
}
