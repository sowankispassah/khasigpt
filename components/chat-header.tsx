"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import { startGlobalProgress } from "@/lib/ui/global-progress";

import { PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  showInlineControls = true,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  showInlineControls?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const _searchParams = useSearchParams();
  const { open } = useSidebar();
  const [isOpeningNewChat, setIsOpeningNewChat] = useState(false);

  const { width: windowWidth } = useWindowSize();
  const isChatShellPath = pathname === "/" || pathname.startsWith("/chat");
  const isChatDetailPage = pathname.startsWith("/chat/");

  useEffect(() => {
    setIsOpeningNewChat(false);
  }, []);

  const handleNewChatClick = useCallback(() => {
    if (isOpeningNewChat) {
      return;
    }
    setIsOpeningNewChat(true);
    startGlobalProgress();
    if (typeof window !== "undefined" && isChatShellPath) {
      window.history.pushState(null, "", "/chat?new=1");
      return;
    }
    router.push("/chat?new=1", { scroll: false });
  }, [isChatShellPath, isOpeningNewChat, router]);

  return (
    <header className="sticky top-0 flex items-center gap-1.5 bg-background px-1.5 py-1.5 pr-[5rem] sm:gap-2 sm:px-2">
      <SidebarToggle />

      {isChatDetailPage ? null : (
        <span className="min-w-0 truncate font-semibold text-sm">
          <EditableTranslation
            defaultText="KhasiGPT"
            description="Application brand name beside the chat sidebar toggle."
            translationKey="app.brand"
          />
        </span>
      )}

      {isChatDetailPage && !isReadonly && showInlineControls ? (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <VisibilitySelector
            chatId={chatId}
            showOnMobile
            selectedVisibilityType={selectedVisibilityType}
          />
        </div>
      ) : null}

      <div className="order-2 ml-auto flex items-center gap-1.5 sm:-mr-2 md:order-3 md:gap-3">
        {isChatDetailPage && (!open || windowWidth < 768) ? (
          <Button
            className="h-8 gap-1.5 px-2 text-sm md:h-fit md:px-2"
            disabled={isOpeningNewChat}
            onClick={handleNewChatClick}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">
              {isOpeningNewChat ? (
                <EditableTranslation
                  defaultText="Opening..."
                  translationKey="navigation.opening"
                />
              ) : (
                <EditableTranslation
                  defaultText="New Chat"
                  translationKey="chat.header.new_chat"
                />
              )}
            </span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly &&
    prevProps.showInlineControls === nextProps.showInlineControls
  );
});
