"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const REQUEST_TIMEOUT_MS = 12_000;

type EditableJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  status: "active" | "inactive";
  description: string;
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
};

type DescriptionMeta = {
  salary: string;
  notificationDate: string;
  lastDate: string;
  body: string;
};

function parseDescriptionMeta(description: string): DescriptionMeta {
  const lines = description.split(/\r?\n/);
  const retainedLines: string[] = [];
  let salary = "";
  let notificationDate = "";
  let lastDate = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      retainedLines.push(rawLine);
      continue;
    }

    const salaryMatch = line.match(/^salary\s*:\s*(.+)$/i);
    if (!salary && salaryMatch?.[1]) {
      salary = salaryMatch[1].trim();
      continue;
    }

    const notificationMatch = line.match(
      /^(?:notification\s*date|advertisement\s*date|published\s*on|date\s*of\s*issue|issue\s*date)\s*:\s*(.+)$/i
    );
    if (!notificationDate && notificationMatch?.[1]) {
      notificationDate = notificationMatch[1].trim();
      continue;
    }

    const deadlineMatch = line.match(
      /^(?:last\s*date|deadline|apply\s*before|closing\s*date|application\s*deadline|submission\s*deadline)\s*:\s*(.+)$/i
    );
    if (!lastDate && deadlineMatch?.[1]) {
      lastDate = deadlineMatch[1].trim();
      continue;
    }

    retainedLines.push(rawLine);
  }

  const body = retainedLines.join("\n").trim();
  return {
    salary,
    notificationDate,
    lastDate,
    body,
  };
}

function composeDescription({
  salary,
  notificationDate,
  lastDate,
  body,
}: DescriptionMeta) {
  const sections: string[] = [];
  const normalizedSalary = salary.trim();
  const normalizedNotificationDate = notificationDate.trim();
  const normalizedLastDate = lastDate.trim();
  const normalizedBody = body.trim();

  if (normalizedSalary) {
    sections.push(`Salary: ${normalizedSalary}`);
  }
  if (normalizedNotificationDate) {
    sections.push(`Notification Date: ${normalizedNotificationDate}`);
  }
  if (normalizedLastDate) {
    sections.push(`Last Date: ${normalizedLastDate}`);
  }
  if (normalizedBody) {
    sections.push(normalizedBody);
  }

  return sections.join("\n\n").trim();
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || payload === null) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String(payload.message)
          : "Request failed";
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function AdminJobEditDialog({ job }: { job: EditableJob }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedMeta = useMemo(
    () => parseDescriptionMeta(job.description ?? ""),
    [job.description]
  );

  const [title, setTitle] = useState(job.title);
  const [company, setCompany] = useState(job.company);
  const [location, setLocation] = useState(job.location);
  const [status, setStatus] = useState<"active" | "inactive">(job.status);
  const [sourceUrl, setSourceUrl] = useState(job.sourceUrl ?? "");
  const [pdfSourceUrl, setPdfSourceUrl] = useState(job.pdfSourceUrl ?? "");
  const [pdfCachedUrl, setPdfCachedUrl] = useState(job.pdfCachedUrl ?? "");
  const [salary, setSalary] = useState(parsedMeta.salary);
  const [notificationDate, setNotificationDate] = useState(parsedMeta.notificationDate);
  const [lastDate, setLastDate] = useState(parsedMeta.lastDate);
  const [descriptionBody, setDescriptionBody] = useState(parsedMeta.body);

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextParsed = parseDescriptionMeta(job.description ?? "");
    setTitle(job.title);
    setCompany(job.company);
    setLocation(job.location);
    setStatus(job.status);
    setSourceUrl(job.sourceUrl ?? "");
    setPdfSourceUrl(job.pdfSourceUrl ?? "");
    setPdfCachedUrl(job.pdfCachedUrl ?? "");
    setSalary(nextParsed.salary);
    setNotificationDate(nextParsed.notificationDate);
    setLastDate(nextParsed.lastDate);
    setDescriptionBody(nextParsed.body);
  }, [open, job]);

  const handleSave = async () => {
    if (saving) {
      return;
    }

    if (!title.trim() || !company.trim() || !location.trim()) {
      toast({
        type: "error",
        description: "Title, company, and location are required.",
      });
      return;
    }

    setSaving(true);
    try {
      const composedDescription = composeDescription({
        salary,
        notificationDate,
        lastDate,
        body: descriptionBody,
      });

      await fetchJsonWithTimeout<{ ok: boolean }>(`/api/admin/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          status,
          sourceUrl: sourceUrl.trim(),
          pdfSourceUrl: pdfSourceUrl.trim(),
          pdfCachedUrl: pdfCachedUrl.trim(),
          description: composedDescription,
        }),
      });

      toast({
        type: "success",
        description: "Job updated.",
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Failed to update job.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        className="h-7 cursor-pointer px-2 text-xs"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        Edit
      </Button>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (saving) {
            return;
          }
          setOpen(nextOpen);
        }}
        open={open}
      >
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Job</DialogTitle>
            <DialogDescription>
              Update job fields saved in Supabase. Salary/deadline/notification are embedded in
              description for display in jobs UI.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 md:grid-cols-2">
            <div className="grid gap-1 md:col-span-2">
              <Label htmlFor={`edit-job-title-${job.id}`}>Title</Label>
              <Input
                id={`edit-job-title-${job.id}`}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-company-${job.id}`}>Company</Label>
              <Input
                id={`edit-job-company-${job.id}`}
                onChange={(event) => setCompany(event.target.value)}
                value={company}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-location-${job.id}`}>Location</Label>
              <Input
                id={`edit-job-location-${job.id}`}
                onChange={(event) => setLocation(event.target.value)}
                value={location}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-status-${job.id}`}>Status</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id={`edit-job-status-${job.id}`}
                onChange={(event) =>
                  setStatus(event.target.value === "inactive" ? "inactive" : "active")
                }
                value={status}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-salary-${job.id}`}>Salary (optional)</Label>
              <Input
                id={`edit-job-salary-${job.id}`}
                onChange={(event) => setSalary(event.target.value)}
                placeholder="e.g. Rs. 25,000/month"
                value={salary}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-notification-${job.id}`}>
                Notification Date (optional)
              </Label>
              <Input
                id={`edit-job-notification-${job.id}`}
                onChange={(event) => setNotificationDate(event.target.value)}
                placeholder="e.g. 18 Feb 2026"
                value={notificationDate}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`edit-job-last-date-${job.id}`}>Last Date (optional)</Label>
              <Input
                id={`edit-job-last-date-${job.id}`}
                onChange={(event) => setLastDate(event.target.value)}
                placeholder="e.g. 05 Mar 2026"
                value={lastDate}
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label htmlFor={`edit-job-description-${job.id}`}>Description</Label>
              <Textarea
                className="min-h-36"
                id={`edit-job-description-${job.id}`}
                onChange={(event) => setDescriptionBody(event.target.value)}
                placeholder="Full job description..."
                value={descriptionBody}
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label htmlFor={`edit-job-source-url-${job.id}`}>
                Source URL (optional; blank keeps existing)
              </Label>
              <Input
                id={`edit-job-source-url-${job.id}`}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.com/job-post"
                value={sourceUrl}
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label htmlFor={`edit-job-pdf-source-url-${job.id}`}>PDF Source URL (optional)</Label>
              <Input
                id={`edit-job-pdf-source-url-${job.id}`}
                onChange={(event) => setPdfSourceUrl(event.target.value)}
                placeholder="https://example.com/notice.pdf"
                value={pdfSourceUrl}
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label htmlFor={`edit-job-pdf-cached-url-${job.id}`}>PDF Cached URL (optional)</Label>
              <Input
                id={`edit-job-pdf-cached-url-${job.id}`}
                onChange={(event) => setPdfCachedUrl(event.target.value)}
                placeholder="https://your-storage/jobs/notice.pdf"
                value={pdfCachedUrl}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              className="cursor-pointer"
              disabled={saving}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              disabled={saving}
              onClick={() => {
                void handleSave();
              }}
              type="button"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

