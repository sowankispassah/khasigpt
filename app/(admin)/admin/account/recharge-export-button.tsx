"use client";

import { useCallback } from "react";

import { Button } from "@/components/ui/button";

type RechargeExportRow = {
  orderId: string;
  userEmail: string;
  planName: string;
  createdAt: string;
  updatedAt: string;
  amountUsd: number;
  amountInr: number;
  currency: string;
  expiresAt: string;
};

type Props = {
  rows: RechargeExportRow[];
};

export function RechargeExportButton({ rows }: Props) {
  const handleExport = useCallback(() => {
    if (!rows.length) {
      return;
    }

    const header = [
      "Order ID",
      "User",
      "Plan",
      "Created at",
      "Updated at",
      "Amount (USD)",
      "Amount (INR)",
      "Currency",
      "Subscription expires",
    ];

    const csv = [
      header.join(","),
      ...rows.map((row) =>
        [
          row.orderId,
          `"${row.userEmail.replace(/"/g, '""')}"`,
          `"${row.planName.replace(/"/g, '""')}"`,
          row.createdAt,
          row.updatedAt,
          row.amountUsd.toFixed(2),
          row.amountInr.toFixed(2),
          row.currency,
          row.expiresAt,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `khasi-gpt-admin-recharges-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [rows]);

  return (
    <Button disabled={!rows.length} onClick={handleExport} variant="outline">
      Export CSV
    </Button>
  );
}
