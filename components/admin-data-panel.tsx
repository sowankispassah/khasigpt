import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminDataPanelProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function AdminDataPanel({
  title,
  children,
  action,
  className,
}: AdminDataPanelProps) {
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card/80 p-5 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          {title}
        </h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="relative mt-4 grow">
        <div className="h-full overflow-x-auto rounded-lg border border-border/60 bg-background/60 px-1 py-1 md:px-0 md:py-0">
          <div className="h-full">{children}</div>
        </div>
      </div>
    </section>
  );
}
