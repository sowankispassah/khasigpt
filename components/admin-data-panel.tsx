import type { ReactNode } from "react";

import { AdminPanel } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

type AdminDataPanelProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Legacy panel API, rendered with the shared AdminPanel card. */
export function AdminDataPanel({
  title,
  children,
  action,
  className,
}: AdminDataPanelProps) {
  return (
    <AdminPanel
      action={action}
      bodyClassName="overflow-x-auto p-4"
      className={cn("h-full", className)}
      title={title}
    >
      {children}
    </AdminPanel>
  );
}
