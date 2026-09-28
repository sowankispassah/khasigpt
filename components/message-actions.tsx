import equal from "fast-deep-equal";
import { Flag, Loader2 } from "lucide-react";
import { memo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { Action, Actions } from "./elements/actions";
import { CopyIcon, PencilEditIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
  setMode,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMode?: (mode: "view" | "edit") => void;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();
  const { translate } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPending, setReportPending] = useState(false);

  const sendReport = async () => {
    if (reportPending) return;
    setReportPending(true);
    try {
      const response = await fetch("/api/report-ai-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messageId: message.id }),
      });
      if (!response.ok) throw new Error("Report failed");
      setReportOpen(false);
      toast.success(translate("chat.report.success", "Report sent. Thank you for helping us improve safety."));
    } catch {
      toast.error(translate("chat.report.error", "Report could not be sent. Please try again."));
    } finally {
      setReportPending(false);
    }
  };

  if (isLoading) {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) {
      toast.error("There's no text to copy!");
      return;
    }

    await copyToClipboard(textFromParts);
    toast.success("Copied to clipboard!");
  };

  // User messages get edit (on hover) and copy actions
  if (message.role === "user") {
    return (
      <Actions className="-mr-0.5 justify-end">
        <div className="relative flex items-center gap-1">
          {setMode && (
            <Action
              className="static mr-1 opacity-100 sm:absolute sm:-left-10 sm:top-0 sm:mr-0 sm:opacity-0 sm:transition-opacity sm:group-hover/message:opacity-100"
              data-testid="message-edit-button"
              onClick={() => setMode("edit")}
              tooltip="Edit"
            >
              <PencilEditIcon />
            </Action>
          )}
          <Action onClick={handleCopy} tooltip="Copy">
            <CopyIcon />
          </Action>
        </div>
      </Actions>
    );
  }

  return (
    <>
    <Actions className="-ml-0.5">
      <Action onClick={handleCopy} tooltip="Copy">
        <CopyIcon />
      </Action>

      <Action
        data-testid="message-upvote"
        disabled={vote?.isUpvoted}
        onClick={() => {
          const upvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "up",
            }),
          });

          toast.promise(upvote, {
            loading: "Upvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: true,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Upvoted Response!";
            },
            error: "Failed to upvote response.",
          });
        }}
        tooltip="Upvote Response"
      >
        <ThumbUpIcon />
      </Action>

      <Action
        data-testid="message-downvote"
        disabled={vote && !vote.isUpvoted}
        onClick={() => {
          const downvote = fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({
              chatId,
              messageId: message.id,
              type: "down",
            }),
          });

          toast.promise(downvote, {
            loading: "Downvoting Response...",
            success: () => {
              mutate<Vote[]>(
                `/api/vote?chatId=${chatId}`,
                (currentVotes) => {
                  if (!currentVotes) {
                    return [];
                  }

                  const votesWithoutCurrent = currentVotes.filter(
                    (currentVote) => currentVote.messageId !== message.id
                  );

                  return [
                    ...votesWithoutCurrent,
                    {
                      chatId,
                      messageId: message.id,
                      isUpvoted: false,
                    },
                  ];
                },
                { revalidate: false }
              );

              return "Downvoted Response!";
            },
            error: "Failed to downvote response.",
          });
        }}
        tooltip="Downvote Response"
      >
        <ThumbDownIcon />
      </Action>
      <Action
        className="h-9 w-auto cursor-pointer gap-1 px-2"
        data-testid="message-report"
        onClick={() => setReportOpen(true)}
        tooltip={translate("chat.report.action", "Report offensive content")}
      >
        <Flag aria-hidden="true" className="size-4" />
        <EditableTranslation defaultText="Report" description="Visible action to flag an AI-generated response." translationKey="chat.report.short_action" />
      </Action>
    </Actions>
    <AlertDialog onOpenChange={(open) => !reportPending && setReportOpen(open)} open={reportOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <EditableTranslation defaultText="Report AI response" description="Title of the offensive AI content report confirmation." translationKey="chat.report.title" />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <EditableTranslation defaultText="Report this response as offensive or harmful? Your report will be sent to our team for review." description="Explains where an AI content report goes." translationKey="chat.report.description" />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button className="cursor-pointer" disabled={reportPending} onClick={() => setReportOpen(false)} type="button" variant="outline">
            <EditableTranslation defaultText="Cancel" description="Cancel an AI content report." translationKey="chat.report.cancel" />
          </Button>
          <Button className="cursor-pointer" disabled={reportPending} onClick={sendReport} type="button">
            {reportPending ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
            {reportPending ? (
              <EditableTranslation defaultText="Sending..." description="AI content report is being sent." translationKey="chat.report.sending" />
            ) : (
              <EditableTranslation defaultText="Send report" description="Submit an offensive AI content report." translationKey="chat.report.submit" />
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }

    return true;
  }
);
