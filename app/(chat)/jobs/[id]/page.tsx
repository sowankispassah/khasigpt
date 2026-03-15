import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Response } from "@/components/elements/response";
import { BackToJobsButton } from "@/components/jobs/back-to-jobs-button";
import { JobDetailsChatShell } from "@/components/jobs/job-details-chat-shell";
import { ExternalPreviewFrame } from "@/components/jobs/external-preview-frame";
import { Button } from "@/components/ui/button";
import { readChatOriginUiContext } from "@/lib/chat/ui-context";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { resolveJobNotificationDateLabel } from "@/lib/jobs/dates";
import { resolveJobSalaryInfo } from "@/lib/jobs/salary";
import { getJobTypeLabel } from "@/lib/jobs/sector";
import { getJobPostingById, toJobCard } from "@/lib/jobs/service";
import { getSiteUrl } from "@/lib/seo/site";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages } from "@/lib/utils";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";

export const dynamic = "force-dynamic";

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getSourceHostLabel(sourceUrl: string | null) {
  if (!sourceUrl) {
    return "Source unavailable";
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "Source available";
  }
}

function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function extractPdfUrlFromContent(content: string) {
  const match = content.match(/PDF Source:\s*(https?:\/\/\S+)/i);
  if (!match?.[1]) {
    return null;
  }

  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function resolvePdfUrl({
  sourceUrl,
  pdfSourceUrl,
  pdfCachedUrl,
  content,
}: {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  content: string;
}) {
  if (isPdfUrl(pdfCachedUrl)) {
    return pdfCachedUrl;
  }
  if (isPdfUrl(pdfSourceUrl)) {
    return pdfSourceUrl;
  }
  if (isPdfUrl(sourceUrl)) {
    return sourceUrl;
  }
  return extractPdfUrlFromContent(content);
}

export default async function JobPostingDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ chatId?: string }>;
}) {
  const { id } = await props.params;
  const resolvedSearchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const session = await auth();
  const jobsEnabled = await isJobsEnabledForRole(session?.user?.role ?? null);

  if (!jobsEnabled) {
    notFound();
  }

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/jobs/${id}`)}`);
  }

  const job = await getJobPostingById({
    id,
    includeInactive: false,
    includeRagState: false,
  });

  if (!job) {
    notFound();
  }

  const detailMarkdown = job.content.trim() || job.pdfContent?.trim() || "";
  const pdfUrl = resolvePdfUrl({
    sourceUrl: job.sourceUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
    content: job.content,
  });
  const pdfMetaText = job.pdfContent?.trim() || null;

  const salaryInfo = resolveJobSalaryInfo({
    salary: job.salary,
    content: detailMarkdown,
    pdfContent: pdfMetaText,
    extractedData: job.pdfExtractedData,
  });
  const salaryLabel = salaryInfo.summary;
  const notificationDateLabel = resolveJobNotificationDateLabel({
    content: detailMarkdown,
    pdfContent: pdfMetaText,
    referenceDate: job.createdAt,
    extractedData: job.pdfExtractedData,
  });
  const fetchedOnLabel = formatDateLabel(job.createdAt);
  const sourceLabel = getSourceHostLabel(job.sourceUrl);
  const proxiedPdfUrl = pdfUrl ? `/api/jobs/${job.id}/pdf` : null;
  const sourcePreviewUrl = job.sourceUrl && !isPdfUrl(job.sourceUrl) ? job.sourceUrl : null;
  const hasAnyFileLinks = Boolean(proxiedPdfUrl || sourcePreviewUrl);
  const showDescriptionText = !proxiedPdfUrl && detailMarkdown.length > 0;
  const jobCard = toJobCard(job);
  const requestedChatId =
    typeof resolvedSearchParams?.chatId === "string" &&
    resolvedSearchParams.chatId.trim().length > 0
      ? resolvedSearchParams.chatId.trim()
      : null;
  const isAdmin = session.user.role === "admin";
  let jobChatSession:
    | {
        chatId: string;
        defaultOpen: true;
        initialHasMoreHistory: boolean;
        initialMessages: ChatMessage[];
        initialOldestMessageAt: string | null;
        initialVisibilityType: "public" | "private";
        isReadonly: boolean;
      }
    | null = null;

  if (requestedChatId) {
    const savedChat = await getChatById({
      id: requestedChatId,
      includeDeleted: true,
    });
    const originUiContext = readChatOriginUiContext(savedChat?.lastContext ?? null);
    const originJobPostingId = originUiContext.jobPostingId;
    if (
      savedChat &&
      savedChat.mode === "jobs" &&
      originJobPostingId === job.id &&
      (!savedChat.deletedAt || isAdmin) &&
      (savedChat.visibility !== "private" ||
        isAdmin ||
        savedChat.userId === session.user.id)
    ) {
      const { messages: messagesFromDb, hasMore } = await getMessagesByChatIdPage({
        id: savedChat.id,
        limit: CHAT_HISTORY_PAGE_SIZE,
      });
      const initialMessages = rewriteDocumentUrlsForViewer({
        messages: convertToUIMessages(messagesFromDb),
        viewerUserId: session.user.id,
        isAdmin,
        baseUrl: getSiteUrl(),
      });
      const oldestMessageAt =
        messagesFromDb[0]?.createdAt instanceof Date
          ? messagesFromDb[0].createdAt.toISOString()
          : messagesFromDb[0]?.createdAt
            ? new Date(messagesFromDb[0].createdAt as unknown as string).toISOString()
            : null;

      jobChatSession = {
        chatId: savedChat.id,
        defaultOpen: true,
        initialHasMoreHistory: hasMore,
        initialMessages,
        initialOldestMessageAt: oldestMessageAt,
        initialVisibilityType: savedChat.visibility,
        isReadonly: session.user.id !== savedChat.userId,
      };
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <div className="flex items-center justify-between gap-2">
        <BackToJobsButton />
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="break-words text-xl sm:text-2xl">{job.title}</CardTitle>
          <CardDescription className="text-sm">
            {job.company} / {job.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p className="break-words">
              <span className="font-medium">Location:</span> {job.location}
            </p>
            <p className="break-words">
              <span className="font-medium">Type:</span> {getJobTypeLabel(job.employmentType)}
            </p>
            <p className="break-words">
              <span className="font-medium">Salary:</span> {salaryLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Notification date:</span>{" "}
              {notificationDateLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Fetched on:</span> {fetchedOnLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Source:</span> {sourceLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {job.sourceUrl ? (
              <Button
                asChild
                className="w-full cursor-pointer sm:w-auto"
                size="sm"
                variant="outline"
              >
                <a href={job.sourceUrl} rel="noreferrer" target="_blank">
                  Open source listing
                </a>
              </Button>
            ) : null}
            {proxiedPdfUrl ? (
              <Button
                asChild
                className="w-full cursor-pointer sm:w-auto"
                size="sm"
                variant="outline"
              >
                <a href={proxiedPdfUrl} rel="noreferrer" target="_blank">
                  Open PDF file
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {salaryInfo.entries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compensation by role</CardTitle>
            <CardDescription>Role-wise compensation extracted from the listing or PDF.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Role</th>
                    <th className="px-4 py-2 text-left font-medium">Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryInfo.entries.map((entry) => (
                    <tr className="border-b last:border-b-0" key={`${entry.role}-${entry.salary}`}>
                      <td className="px-4 py-2 align-top">{entry.role}</td>
                      <td className="px-4 py-2 align-top">{entry.salary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showDescriptionText ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About the job</CardTitle>
            <CardDescription>Detailed description extracted from the source listing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Response className="prose prose-zinc max-w-none text-sm leading-relaxed [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_li]:my-1 [&_ol]:pl-5 [&_p]:my-3 [&_ul]:pl-5">
              {detailMarkdown}
            </Response>
          </CardContent>
        </Card>
      ) : null}

      {proxiedPdfUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relevant file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-0 pb-0">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-6">
                <a
                  className="cursor-pointer text-primary text-sm underline underline-offset-2"
                  href={proxiedPdfUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open PDF in new tab
                </a>
              </div>
              <ExternalPreviewFrame
                format="pdf"
                src={proxiedPdfUrl}
                title={`${job.title} PDF`}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasAnyFileLinks && sourcePreviewUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Original source page</CardTitle>
            <CardDescription>Open the original listing in a new tab.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              className="cursor-pointer break-all text-primary text-sm underline underline-offset-2"
              href={sourcePreviewUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open source page in new tab
            </a>
          </CardContent>
        </Card>
      ) : null}

      <JobDetailsChatShell
        chatId={jobChatSession?.chatId ?? null}
        defaultOpen={jobChatSession?.defaultOpen ?? false}
        initialHasMoreHistory={jobChatSession?.initialHasMoreHistory ?? false}
        initialMessages={jobChatSession?.initialMessages ?? []}
        initialOldestMessageAt={jobChatSession?.initialOldestMessageAt ?? null}
        initialVisibilityType={jobChatSession?.initialVisibilityType ?? "private"}
        isReadonly={jobChatSession?.isReadonly ?? false}
        jobContext={jobCard}
        key={jobChatSession?.chatId ?? job.id}
        userRole={session.user.role ?? null}
      />
    </div>
  );
}
