"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

type TargetType = "thread" | "post" | "user";
type Reason = "harassment" | "hate" | "sexual" | "violence" | "spam" | "other";

export function ForumSafetyActions({
  postId,
  threadSlug,
  viewerId,
}: {
  postId?: string;
  threadSlug: string;
  viewerId: string | null;
}) {
  const { translate } = useTranslation();
  const [targetType, setTargetType] = useState<TargetType | null>(null);
  const [reason, setReason] = useState<Reason>("harassment");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const label = (key: string, fallback: string) => translate(key, fallback);
  const goToLogin = () => {
    window.location.href = `/login?redirect=${encodeURIComponent(`/forum/${threadSlug}`)}`;
  };
  const submitReport = async () => {
    if (!targetType || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/forum/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadSlug, targetType, postId, reason, details }),
      });
      if (!response.ok) throw new Error("Failed to report");
      setTargetType(null);
      setDetails("");
      toast.success(label("forum.safety.report_success", "Report sent to our team."));
    } catch {
      toast.error(label("forum.safety.report_error", "Could not send report. Please try again."));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-auto cursor-pointer rounded-full border border-border px-3 py-1 text-muted-foreground text-xs hover:border-primary/30 hover:bg-primary/5" disabled={pending} size="sm" type="button" variant="ghost">
            <Flag aria-hidden="true" className="mr-1 size-3.5" />
            <EditableTranslation defaultText="Report" description="Open forum report choices." translationKey="forum.safety.open_report" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="cursor-pointer" onSelect={() => viewerId ? setTargetType(postId ? "post" : "thread") : goToLogin()}>
            <EditableTranslation defaultText={postId ? "Report reply" : "Report discussion"} description="Report this forum post." translationKey={postId ? "forum.safety.report_reply" : "forum.safety.report_thread"} />
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={() => viewerId ? setTargetType("user") : goToLogin()}>
            <EditableTranslation defaultText="Report user" description="Report this forum author." translationKey="forum.safety.report_user" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog onOpenChange={(open) => !open && !pending && setTargetType(null)} open={Boolean(targetType)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><EditableTranslation defaultText="Report forum content" description="Forum report form title." translationKey="forum.safety.report_title" /></DialogTitle>
            <DialogDescription><EditableTranslation defaultText="Tell us what is wrong. Our team will review this report." description="Forum report form description." translationKey="forum.safety.report_description" /></DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            <span><EditableTranslation defaultText="Reason" description="Forum report reason label." translationKey="forum.safety.reason" /></span>
            <select className="w-full cursor-pointer rounded-md border bg-background p-2" disabled={pending} onChange={(event) => setReason(event.target.value as Reason)} value={reason}>
              {(["harassment", "hate", "sexual", "violence", "spam", "other"] as const).map((value) => (
                <option key={value} value={value}>{label(`forum.safety.reason.${value}`, {
                  harassment: "Harassment or bullying", hate: "Hate or discrimination", sexual: "Sexual content", violence: "Violence or dangerous content", spam: "Spam or scam", other: "Other",
                }[value])}</option>
              ))}
            </select>
          </label>
          <Textarea disabled={pending} maxLength={2000} onChange={(event) => setDetails(event.target.value)} placeholder={label("forum.safety.details", "More details (optional)")} value={details} />
          <Button className="cursor-pointer" disabled={pending} onClick={submitReport}>
            {pending ? <LoaderIcon className="mr-2 animate-spin" size={16} /> : null}
            <EditableTranslation defaultText={pending ? "Sending..." : "Send report"} description="Submit the forum report." translationKey={pending ? "forum.safety.sending" : "forum.safety.submit"} />
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ForumBlockAction({ authorId, onBlocked, viewerId }: {
  authorId: string;
  onBlocked: (authorId: string) => void;
  viewerId: string | null;
}) {
  const { translate } = useTranslation();
  const [pending, setPending] = useState(false);
  if (!viewerId || viewerId === authorId) return null;

  const block = async () => {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/forum/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: authorId }),
      });
      if (!response.ok) throw new Error("Failed to block");
      toast.success(translate("forum.safety.block_success", "User blocked."));
      onBlocked(authorId);
    } catch {
      toast.error(translate("forum.safety.block_error", "Could not block this user."));
    } finally {
      setPending(false);
    }
  };

  return <Button className="cursor-pointer" disabled={pending} onClick={block} size="sm" variant="ghost">
    {pending ? <LoaderIcon className="mr-1 animate-spin" size={14} /> : null}
    <EditableTranslation defaultText="Block user" description="Hide this author's forum posts." translationKey="forum.safety.block_user" />
  </Button>;
}

export function BlockedForumUsersButton({ onUnblocked }: { onUnblocked: () => void }) {
  const { translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/forum/blocks", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load");
      const payload = await response.json() as { users: Array<{ id: string; displayName: string }> };
      setUsers(payload.users);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  const unblock = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    try {
      const response = await fetch("/api/forum/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error("Failed to unblock");
      setUsers((current) => current.filter((item) => item.id !== userId));
      onUnblocked();
    } catch {
      toast.error(translate("forum.safety.unblock_error", "Could not unblock this user."));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <>
      <Button className="w-full cursor-pointer" onClick={() => { setOpen(true); void load(); }} variant="outline">
        <EditableTranslation defaultText="Blocked users" description="Manage blocked forum users." translationKey="forum.safety.blocked_users" />
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle><EditableTranslation defaultText="Blocked users" description="Manage blocked forum users." translationKey="forum.safety.blocked_users" /></DialogTitle>
            <DialogDescription><EditableTranslation defaultText="Their discussions and replies are hidden from you." description="Explains forum blocking." translationKey="forum.safety.blocked_description" /></DialogDescription>
          </DialogHeader>
          {loading ? <LoaderIcon className="animate-spin" size={18} /> : null}
          {error ? <Button className="cursor-pointer" onClick={load} variant="outline"><EditableTranslation defaultText="Try again" description="Retry loading blocked users." translationKey="common.try_again" /></Button> : null}
          {!loading && !error && users.length === 0 ? <p className="text-muted-foreground text-sm"><EditableTranslation defaultText="You have not blocked anyone." description="Empty blocked forum users list." translationKey="forum.safety.blocked_empty" /></p> : null}
          {!loading && !error ? users.map((item) => (
            <div className="flex items-center justify-between gap-3" key={item.id}>
              <span className="truncate">{item.displayName}</span>
              <Button className="cursor-pointer" disabled={Boolean(busyId)} onClick={() => unblock(item.id)} size="sm" variant="outline">
                {busyId === item.id ? <LoaderIcon className="mr-1 animate-spin" size={14} /> : null}
                <EditableTranslation defaultText="Unblock" description="Unblock a forum user." translationKey="forum.safety.unblock" />
              </Button>
            </div>
          )) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
