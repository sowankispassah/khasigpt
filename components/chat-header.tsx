"use client";

import { useRouter } from "next/navigation";
import { memo, useTransition } from "react";
import { useWindowSize } from "usehooks-ts";

import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";

import { LoaderIcon, PlusIcon } from "./icons";
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

  const { width: windowWidth } = useWindowSize();

  return (
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
              startTransition(() => {
                router.push("/");
                router.refresh();
              });
            }}
            variant="outline"
          >
            {isPending ? (
              <span className="flex items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center animate-spin">
                  <LoaderIcon size={14} />
                </span>
                <span className="md:sr-only">Loading</span>
              </span>
            ) : (
              <>
                <PlusIcon />
                <span className="md:sr-only">New Chat</span>
              </>
            )}
          </Button>
        )}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
