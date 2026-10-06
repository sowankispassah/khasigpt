"use client";

import { Eye, EyeOff, InfoIcon, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ReceiptDownloadButton } from "@/components/receipt-download-button";
import { EditableTranslation, useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { compactTransactionCode } from "@/lib/ui/compact-transaction-code";
import { cn } from "@/lib/utils";

type HistoryRow = {
  orderId: string;
  planLabel: string;
  amountLabel: string;
  statusLabel: string;
  statusIcon: string;
  statusColor: string;
  canRetry: boolean;
  dateLabel: string;
};

type RechargeHistoryDialogProps = {
  rows: HistoryRow[];
  labels: {
    title: string;
    subtitle: string;
    empty: string;
    plan: string;
    amount: string;
    status: string;
    date: string;
    trigger: string;
    close: string;
    retry: string;
  };
};

export function RechargeHistoryDialog({
  rows,
  labels,
}: RechargeHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [revealedCode, setRevealedCode] = useState<string | null>(null);
  const fullCodeId = useId();
  const showCode = useEditableTranslation("billing.transaction_code.show", "View full transaction code");
  const hideCode = useEditableTranslation("billing.transaction_code.hide", "Hide transaction code");
  const router = useRouter();
  const hasRows = rows.length > 0;

  return (
    <Dialog onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setRevealedCode(null); }} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label={labels.trigger}
          className="h-8 w-8 shrink-0"
          size="icon"
          title={labels.trigger}
          variant="ghost"
        >
          <InfoIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%_-_1.5rem)] min-w-0 max-w-3xl max-h-[calc(100dvh_-_2rem)] overflow-y-auto">
        <DialogHeader className="text-center">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription className="mx-auto max-w-lg">
            {labels.subtitle}
          </DialogDescription>
        </DialogHeader>
        {hasRows ? (
          <div className="max-h-96 min-w-0 max-w-full overflow-auto rounded-md border" data-testid="recharge-history-scroll">
            <table className="w-full divide-y divide-border whitespace-nowrap text-sm [&_td]:px-3 [&_th]:px-3">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">{labels.plan}</th>
                  <th className="px-4 py-2 text-left">{labels.amount}</th>
                  <th className="px-4 py-2 text-center">{labels.status}</th>
                  <th className="px-4 py-2 text-left">{labels.date}</th>
                  <th className="px-4 py-2 text-center"><EditableTranslation translationKey="billing.receipt.title" defaultText="Receipt" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {rows.map((row) => (
                  <tr key={row.orderId}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.planLabel}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground text-xs" data-testid="compact-transaction-code">{compactTransactionCode(row.orderId)}</span>
                          <Button type="button" aria-label={revealedCode === row.orderId ? hideCode.text : showCode.text} aria-controls={fullCodeId} aria-expanded={revealedCode === row.orderId} className="h-8 w-8 shrink-0 cursor-pointer" onClick={() => setRevealedCode((current) => current === row.orderId ? null : row.orderId)} size="icon" variant="ghost">
                            {revealedCode === row.orderId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.amountLabel}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs",
                            row.statusColor
                          )}
                        >
                          <span aria-hidden="true">{row.statusIcon}</span>
                          {row.statusLabel}
                        </span>
                        {row.canRetry ? (
                          <Button
                            aria-label={labels.retry}
                            className="h-7 w-7"
                            onClick={() => {
                              setOpen(false);
                              router.push("/recharge");
                            }}
                            size="icon"
                            title={labels.retry}
                            variant="ghost"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{row.dateLabel}</td>
                    <td className="px-4 py-3 text-center">{!row.canRetry ? <ReceiptDownloadButton orderId={row.orderId} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{labels.empty}</p>
        )}
        {revealedCode ? (
          <div className="min-w-0 rounded-md border p-3" id={fullCodeId}>
            <p className="mb-2 font-medium text-xs"><EditableTranslation translationKey="billing.transaction_code.full" defaultText="Full transaction code" /></p>
            <p className="max-w-full select-all overflow-x-auto whitespace-nowrap pb-1 font-mono text-xs" data-testid="full-transaction-code">{revealedCode}</p>
          </div>
        ) : null}
        {showCode.editButton || hideCode.editButton ? <div className="flex items-center gap-2">{showCode.editButton}{hideCode.editButton}</div> : null}
        <DialogFooter>
          <DialogClose>{labels.close}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
