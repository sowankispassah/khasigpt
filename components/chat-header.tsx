"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useWindowSize } from "usehooks-ts";

import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";

import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";



function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const [isPending, startTransition] = useTransition();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    timersRef.current = [];
  }, []);

  const startProgress = useCallback(() => {
    clearTimers();
    setShowProgress(true);
    setProgress(12);
    const timers = [
      setTimeout(() => setProgress(40), 120),
      setTimeout(() => setProgress(70), 260),
      setTimeout(() => setProgress(90), 520),
    ];
    timersRef.current = timers;
  }, [clearTimers]);

  const resetProgress = useCallback(() => {
    clearTimers();
    setShowProgress(false);
    setProgress(0);
  }, [clearTimers]);

  useEffect(() => {
    if (!isPending) {
      resetProgress();
    }
  }, [isPending, resetProgress]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const { width: windowWidth } = useWindowSize();

  return (
    <>
      {showProgress ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 pr-[5rem] md:px-2 md:pr-[5rem]">
      <SidebarToggle />

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="order-2 ml-auto -mr-2 flex items-center gap-3 md:order-3">
        {(!open || windowWidth < 768) && (
          <Button
            aria-busy={isPending}
            className="h-8 px-2 md:h-fit md:px-2"
            disabled={isPending}
            onClick={() => {
              if (isPending) {
                return;
              }
              startProgress();
              startTransition(() => {
                router.push("/");
                router.refresh();
              });
            }}
            variant="outline"
          >
            {(
              <>
                <PlusIcon />
                <span className="md:sr-only">New Chat</span>
              </>
            )}
          </Button>
        )}
      </div>
    </header>
    </>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
