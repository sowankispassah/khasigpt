"use client";

import { MessageSquareText, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FloatingChatPopupProps = {
  children: ReactNode;
  isVisible: boolean;
  onClose: () => void;
  onOpen: () => void;
  title?: string;
};

export function FloatingChatPopup({
  children,
  isVisible,
  onClose,
  onOpen,
  title = "Chat",
}: FloatingChatPopupProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div
        aria-hidden={!isVisible}
        className={cn(
          "pointer-events-auto fixed right-1 bottom-1 flex origin-bottom-right flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/95 shadow-2xl backdrop-blur transition-all duration-200 ease-out",
          "w-[calc(100vw-0.5rem)] h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] min-h-[calc(100dvh-0.5rem)]",
          "sm:right-2 sm:bottom-2 sm:w-[min(33.8rem,calc(100vw-1rem))] sm:h-[min(82vh,46.8rem)] sm:max-h-[min(82vh,46.8rem)] sm:min-h-[min(82vh,46.8rem)]",
          "lg:right-3 lg:bottom-3 lg:w-[min(44rem,calc(100vw-1.5rem))] lg:h-[min(96vh,79rem)] lg:max-h-[min(96vh,79rem)] lg:min-h-[min(96vh,79rem)]",
          isVisible
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0"
        )}
      >
        <div className="flex items-center justify-between border-border/60 border-b px-4 py-3">
          <div className="font-medium text-sm">{title}</div>
          <Button
            className="h-8 w-8 cursor-pointer rounded-full border border-border bg-background p-0 shadow-sm hover:bg-muted"
            onClick={onClose}
            size="sm"
            title="Close chat"
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close chat</span>
          </Button>
        </div>
        <div className="min-h-0 flex flex-1 flex-col overscroll-behavior-contain">
          {children}
        </div>
      </div>
      <div
        className={cn(
          "pointer-events-auto fixed right-[10px] bottom-[10px] transition-all duration-200 ease-out",
          isVisible
            ? "translate-y-2 scale-95 opacity-0 pointer-events-none"
            : "translate-y-0 scale-100 opacity-100"
        )}
      >
        <Button
          className="h-8 w-8 cursor-pointer rounded-full border border-border bg-background p-0 shadow-sm hover:bg-muted [&_svg]:!h-6 [&_svg]:!w-6"
          onClick={onOpen}
          size="sm"
          title="Open chat"
          type="button"
          variant="outline"
        >
          <MessageSquareText />
          <span className="sr-only">Open chat</span>
        </Button>
      </div>
    </div>
  );
}
