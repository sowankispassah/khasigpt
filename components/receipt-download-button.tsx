"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useEditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";

export function ReceiptDownloadButton({ orderId, admin = false }: { orderId: string; admin?: boolean }) {
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const label = useEditableTranslation("billing.receipt.download", "Download receipt");
  const failure = useEditableTranslation("billing.receipt.error", "Unable to download the receipt. Please try again.");
  async function download() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/${admin ? "admin/account" : "billing"}/receipts/${encodeURIComponent(orderId)}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Receipt unavailable");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "KhasiGPT-receipt.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(failure.text);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <div className="inline-flex items-center">
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 cursor-pointer" aria-label={label.text} title={label.text} aria-busy={pending} disabled={pending} onClick={download}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      </Button>
      {label.editButton}
      {failure.editButton}
    </div>
  );
}
