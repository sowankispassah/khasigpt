"use client";

import { InfoIcon, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const hasRows = rows.length > 0;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
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
      <DialogContent className="max-w-3xl">
        <DialogHeader className="text-center">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription className="mx-auto max-w-lg">
            {labels.subtitle}
          </DialogDescription>
        </DialogHeader>
        {hasRows ? (
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">{labels.plan}</th>
                  <th className="px-4 py-2 text-left">{labels.amount}</th>
                  <th className="px-4 py-2 text-center">{labels.status}</th>
                  <th className="px-4 py-2 text-left">{labels.date}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {rows.map((row) => (
                  <tr key={row.orderId}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.planLabel}</span>
                        <span className="text-muted-foreground text-xs">
                          {row.orderId}
                        </span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{labels.empty}</p>
        )}
        <DialogFooter>
          <DialogClose>{labels.close}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
