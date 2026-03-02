"use client";

import { SidebarToggle } from "@/components/sidebar-toggle";

export function ChatLoadingShell() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-background px-2 py-1.5 pr-[5rem] md:pr-[5rem]">
        <SidebarToggle />
        <div className="h-8 w-24 animate-pulse rounded-full bg-muted md:w-40" />
      </header>

      <div className="flex flex-1 flex-col gap-4 px-3 py-6 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-1 animate-pulse flex-col gap-4">
          <div className="h-48 rounded-2xl bg-muted" />
          <div className="h-6 w-full rounded-full bg-muted/80" />
          <div className="mt-auto flex flex-col gap-2">
            <div className="h-9 rounded-2xl bg-muted" />
            <div className="h-16 rounded-xl border border-muted-foreground/40 border-dashed" />
          </div>
        </div>
      </div>
    </div>
  );
}

