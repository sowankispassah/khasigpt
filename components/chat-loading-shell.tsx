"use client";

import { ChevronDownIcon, GlobeIcon } from "@/components/icons";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";

export function ChatLoadingShell() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-background px-2 py-1.5 pr-[5rem] md:pr-[5rem]">
        <SidebarToggle />
        <div className="flex items-center gap-2">
          <Button className="h-8 px-2 md:h-fit md:px-2" disabled variant="outline">
            <GlobeIcon size={14} />
            <span className="text-xs">Private</span>
          </Button>
          <button
            className="flex h-8 items-center gap-2 rounded-lg border-0 bg-background px-2 text-foreground shadow-none"
            disabled
            type="button"
          >
            <span className="font-medium text-xs">Model</span>
            <ChevronDownIcon size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-3 py-6 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4">
          <div className="animate-pulse">
            <div className="h-48 rounded-2xl bg-muted" />
            <div className="mt-4 h-6 w-full rounded-full bg-muted/80" />
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <div className="rounded-xl border border-border bg-background p-3 shadow-xs">
              <div className="min-h-[44px] rounded-md bg-transparent p-2 text-sm text-muted-foreground">
                Send a message...
              </div>
              <div className="flex items-center justify-between p-0">
                <div className="flex items-center gap-1">
                  <div className="h-8 w-8 rounded-lg bg-muted/60" />
                  <div className="h-8 w-24 rounded-lg bg-muted/60" />
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
