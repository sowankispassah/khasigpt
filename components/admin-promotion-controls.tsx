"use client";

import { ChevronRight, Loader2, MoreVertical } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { REFERRAL_COPY } from "@/lib/referrals/copy";

export function PromotionText({ name }: { name: keyof typeof REFERRAL_COPY }) {
  return <EditableTranslation translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} />;
}

export function AdminPromotionSection({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="rounded-2xl border bg-card/60 p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button aria-controls={id} aria-expanded={open} className="flex min-w-0 cursor-pointer items-center gap-3 text-left" onClick={() => setOpen(!open)} type="button">
        <ChevronRight aria-hidden="true" className={`size-5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span><span className="block text-lg font-semibold">{title}</span>{description ? <span className="block text-sm text-muted-foreground">{description}</span> : null}</span>
      </button>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
    <div hidden={!open} id={id} className="mt-4 border-t pt-4">{children}</div>
  </section>;
}

export function PromotionActions({ label, disabled, items }: { label: string; disabled?: boolean; items: Array<{ name: keyof typeof REFERRAL_COPY; action: () => unknown; disabled?: boolean; destructive?: boolean }> }) {
  const { translate } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function run(action: () => unknown) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch { toast.error(translate("referrals.unavailable", REFERRAL_COPY.unavailable)); }
    finally { setBusy(false); }
  }
  return <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={label} aria-busy={busy} className="cursor-pointer" disabled={busy || disabled} size="icon" variant="ghost">{busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{items.map(item => <DropdownMenuItem className={item.destructive ? "cursor-pointer text-destructive" : "cursor-pointer"} disabled={busy || item.disabled} key={item.name} onSelect={() => void run(item.action)}><PromotionText name={item.name} /></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

export function PromotionDeleteDialog({ open, onOpenChange, onDelete }: { open: boolean; onOpenChange: (open: boolean) => void; onDelete: () => Promise<boolean> }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <AlertDialog open={open} onOpenChange={value => { if (!pending) { setFailed(false); onOpenChange(value); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle><PromotionText name="delete_title" /></AlertDialogTitle><AlertDialogDescription><PromotionText name="delete_description" /></AlertDialogDescription></AlertDialogHeader>{failed ? <p className="text-sm text-destructive" role="alert"><PromotionText name="unavailable" /></p> : null}<AlertDialogFooter><Button className="cursor-pointer" disabled={pending} onClick={() => { setFailed(false); onOpenChange(false); }} variant="outline"><PromotionText name="cancel" /></Button><Button className="cursor-pointer" disabled={pending} onClick={async () => { setPending(true); setFailed(false); try { if (await onDelete()) onOpenChange(false); else setFailed(true); } catch { setFailed(true); } finally { setPending(false); } }} variant="destructive">{pending ? <><Loader2 className="mr-2 size-4 animate-spin" /><PromotionText name="deleting" /></> : <PromotionText name="delete" />}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
