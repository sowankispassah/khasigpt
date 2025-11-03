"use client";

import { useCallback } from "react";

import { Button } from "@/components/ui/button";

type TableRow = {
  chatId: string;
  userEmail: string;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  chargeUsd: number;
  chargeInr: number;
  providerCostUsd: number;
  providerCostInr: number;
  profitInr: number;
};

type Props = {
  rows: TableRow[];
};

export function ExportButton({ rows }: Props) {
  const handleExport = useCallback(() => {
    if (!rows.length) {
      return;
    }

    const header = [
      "Chat ID",
      "User",
      "Created at",
      "Input tokens",
      "Output tokens",
      "Credits",
      "User charge (USD)",
      "User charge (INR)",
      "Provider cost (USD)",
      "Provider cost (INR)",
      "Profit (INR)",
    ];

    const csv = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.chatId,
          `"${row.userEmail.replace(/"/g, '""')}"`,
          row.createdAt,
          row.inputTokens.toFixed(0),
          row.outputTokens.toFixed(0),
          row.credits.toFixed(2),
          row.chargeUsd.toFixed(2),
          row.chargeInr.toFixed(2),
          row.providerCostUsd.toFixed(2),
          row.providerCostInr.toFixed(2),
          row.profitInr.toFixed(2),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `khasi-gpt-admin-transactions-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  return (
    <Button disabled={!rows.length} onClick={handleExport} variant="outline">
      Export CSV
    </Button>
  );
}
