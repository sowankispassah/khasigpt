"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useTransition } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";

import { Button } from "@/components/ui/button";

export function AdminSectionError({
  error,
  reset,
  sectionName,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  sectionName: string;
}) {
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(`[admin] ${sectionName} section failed.`, error);
  }, [error, sectionName]);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="max-w-2xl space-y-3">
        <p className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Unable to load {section}"
            description="Heading shown when an admin section cannot load."
            translationKey="admin.section.error.title"
            values={{ section: sectionName.toLowerCase() }}
          />
        </p>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="This admin section failed independently. The sidebar and other admin sections remain available."
            description="Explanation shown when an admin section fails independently."
            translationKey="admin.section.error.description"
          />
        </p>
        <Button
          aria-busy={isRetrying}
          className="cursor-pointer"
          disabled={isRetrying}
          onClick={() => startRetry(reset)}
          type="button"
        >
          {isRetrying ? (
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              <span>
                <EditableTranslation
                  defaultText="Retrying..."
                  description="Button label shown while an admin section is being retried."
                  translationKey="admin.section.error.retrying"
                />
              </span>
            </span>
          ) : (
            <EditableTranslation
              defaultText="Retry section"
              description="Button label that retries a failed admin section."
              translationKey="admin.section.error.retry"
            />
          )}
        </Button>
      </div>
    </section>
  );
}
