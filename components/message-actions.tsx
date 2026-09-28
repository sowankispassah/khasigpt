import equal from "fast-deep-equal";
import { Loader2, X } from "lucide-react";
import { memo, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { useCopyToClipboard } from "usehooks-ts";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { Action, Actions } from "./elements/actions";
import { CopyIcon, PencilEditIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";

const feedbackCategories = [
  { value: "incorrect", key: "chat.feedback.incorrect", label: "Incorrect or incomplete" },
  { value: "not_requested", key: "chat.feedback.not_requested", label: "Not what I asked for" },
  { value: "slow_buggy", key: "chat.feedback.slow_buggy", label: "Slow or buggy" },
  { value: "style_tone", key: "chat.feedback.style_tone", label: "Style or tone" },
  { value: "safety", key: "chat.feedback.safety", label: "Safety or offensive content" },
  { value: "other", key: "chat.feedback.other", label: "Other" },
] as const;

type FeedbackCategory = (typeof feedbackCategories)[number]["value"];

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory | null>(null);
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);

  const closeFeedback = () => {
    if (feedbackPending) return;
    setFeedbackOpen(false);
    setFeedbackCategory(null);
    setFeedbackDetails("");
  };

  const sendFeedback = async () => {
    if (feedbackPending || !feedbackCategory) return;
    setFeedbackPending(true);
    try {
      const response = await fetch("/api/report-ai-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messageId: message.id, category: feedbackCategory, details: feedbackDetails.trim() }),
      });
      if (!response.ok) throw new Error("Feedback failed");
      setFeedbackOpen(false);
      setFeedbackCategory(null);
      setFeedbackDetails("");
      toast.success(translate("chat.feedback.success", "Feedback sent. Thank you."));
      if (!vote || vote.isUpvoted) {
        try {
          const voteResponse = await fetch("/api/vote", {
            method: "PATCH",
            body: JSON.stringify({ chatId, messageId: message.id, type: "down" }),
          });
          if (voteResponse.ok) {
            await mutate<Vote[]>(`/api/vote?chatId=${chatId}`);
          }
        } catch {
          // Feedback has already reached the review queue.
        }
      }
    } catch {
      toast.error(translate("chat.feedback.error", "Feedback could not be sent. Please try again."));
    } finally {
      setFeedbackPending(false);
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
        onClick={() => setFeedbackOpen(true)}
        tooltip={translate("chat.feedback.action", "Dislike or report this response")}
      >
        <ThumbDownIcon />
      </Action>
    </Actions>
    <Dialog onOpenChange={(open) => { if (open) setFeedbackOpen(true); else closeFeedback(); }} open={feedbackOpen}>
      <DialogContent className="max-w-xl gap-5 rounded-2xl">
        <button aria-label={translate("chat.feedback.close", "Close feedback")} className="absolute right-4 top-4 cursor-pointer rounded p-1 hover:bg-muted" disabled={feedbackPending} onClick={closeFeedback} type="button"><X aria-hidden="true" className="size-4" /></button>
        <DialogHeader>
          <DialogTitle><EditableTranslation defaultText="Share feedback" description="Title of the response feedback form." translationKey="chat.feedback.title" /></DialogTitle>
          <DialogDescription><EditableTranslation defaultText="Choose a reason. Use Safety or offensive content to flag a response for review." description="Explains the feedback and safety report options." translationKey="chat.feedback.description" /></DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {feedbackCategories.map((category) => (
            <button
              aria-pressed={feedbackCategory === category.value}
              className={`cursor-pointer rounded-full border px-3 py-2 text-sm transition-colors ${feedbackCategory === category.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              disabled={feedbackPending}
              key={category.value}
              onClick={() => setFeedbackCategory(category.value)}
              type="button"
            >
              <EditableTranslation defaultText={category.label} description={`Feedback reason: ${category.label}.`} translationKey={category.key} />
            </button>
          ))}
        </div>
        <div>
          <label className="mb-2 block text-sm" htmlFor={`feedback-details-${message.id}`}>
            <EditableTranslation defaultText="Share details (optional)" description="Label for optional response feedback details." translationKey="chat.feedback.details" />
          </label>
          <Textarea
            id={`feedback-details-${message.id}`}
            maxLength={2000}
            onChange={(event) => setFeedbackDetails(event.target.value)}
            rows={3}
            value={feedbackDetails}
          />
        </div>
        <p className="text-muted-foreground text-xs"><EditableTranslation defaultText="The selected response and your feedback will be shared with our team for review." description="Explains what response feedback shares." translationKey="chat.feedback.privacy" /></p>
        <DialogFooter>
          <Button className="cursor-pointer" disabled={feedbackPending || !feedbackCategory} onClick={sendFeedback} type="button">
            {feedbackPending ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : null}
            <EditableTranslation defaultText={feedbackPending ? "Sending..." : "Submit"} description="Submit response feedback." translationKey={feedbackPending ? "chat.feedback.sending" : "chat.feedback.submit"} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId || prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }

    return true;
  }
);
