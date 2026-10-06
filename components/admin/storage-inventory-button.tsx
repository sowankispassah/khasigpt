"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { STORAGE_COPY } from "@/lib/uploads/storage-copy";

export function StorageInventoryButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"failed" | "skipped" | "done" | null>(null);
  async function inspect() {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/admin/storage", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Inspection failed");
      const result = await response.json() as { skipped?: boolean; ok?: boolean };
      if (!result.skipped && result.ok !== true) throw new Error("Inspection incomplete");
      setOutcome(result.skipped ? "skipped" : "done");
      if (!result.skipped) router.refresh();
    } catch { setOutcome("failed"); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col items-start gap-2"><Button disabled={busy} onClick={inspect} type="button">{busy && <Loader2 aria-hidden className="animate-spin" />}<EditableTranslation {...STORAGE_COPY[busy ? "inspecting" : "inspect"]} /></Button>{outcome && <output className="text-sm"><EditableTranslation {...STORAGE_COPY[outcome === "failed" ? "inspectFailed" : outcome === "skipped" ? "inspectSkipped" : "inspectDone"]} /></output>}</div>;
}
