import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useStudyContextSummary } from "@/hooks/use-study-context";
import type { Chat } from "@/lib/db/schema";
import type { ChatHistoryMode } from "./sidebar-history";
import { preloadChat } from "./chat-loader";
import {
  CheckCircleFillIcon,
  GlobeIcon,
  LoaderIcon,
  LockIcon,
  MoreHorizontalIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

const PureChatItem = ({
  chat,
  historyKey,
  historyMode,
  isActive,
  onDelete,
  onOpen,
  onPrefetch,
}: {
  chat: Chat;
  historyKey?: string;
  historyMode?: ChatHistoryMode;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onOpen: (chatId: string) => boolean;
  onPrefetch?: (chatId: string) => void;
}) => {
  const pathname = usePathname();
  const href = `/chat/${chat.id}`;
  const [isPending, setIsPending] = useState(false);
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    if (!isPending) {
      return;
    }
    if (pathname === href) {
      setIsPending(false);
    }
  }, [href, isPending, pathname]);

  const maybePrefetch = useCallback(() => {
    if (hasPrefetchedRef.current) {
      return;
    }
    hasPrefetchedRef.current = true;
    onPrefetch?.(chat.id);
  }, [onPrefetch, chat.id]);

  const studyContextSummary = useStudyContextSummary(
    historyMode === "study" ? chat.id : null
  );
  const studyTitle =
    historyMode === "study"
      ? [studyContextSummary?.exam, studyContextSummary?.role, studyContextSummary?.year]
          .map((part) =>
            typeof part === "string" ? part.trim() : `${part ?? ""}`.trim()
          )
          .filter((part) => part.length > 0)
          .join(" / ")
      : "";
  const displayTitle =
    studyTitle || studyContextSummary?.title?.trim() || chat.title;
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
    historyKey,
    historyMode,
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link
          aria-busy={isPending}
          aria-disabled={isPending}
          className="flex w-full items-center gap-2 truncate text-left"
          href={href}
          scroll={false}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }

            if (isPending) {
              event.preventDefault();
              return;
            }

            const shouldNavigate = onOpen(chat.id);
            if (!shouldNavigate) {
              event.preventDefault();
              return;
            }

            setIsPending(true);
          }}
          onFocus={() => {
            preloadChat();
            maybePrefetch();
          }}
          onMouseEnter={() => {
            preloadChat();
            maybePrefetch();
          }}
          onTouchStart={() => {
            preloadChat();
            maybePrefetch();
          }}
        >
          <span className="flex-1 truncate">{displayTitle}</span>
          {isPending ? (
            <span className="inline-flex size-4 items-center justify-center text-sidebar-foreground/70">
              <LoaderIcon className="animate-spin" size={12} />
            </span>
          ) : null}
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
              <ShareIcon />
              <span>Share</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType("private");
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <LockIcon size={12} />
                    <span>Private</span>
                  </div>
                  {visibilityType === "private" ? (
                    <CheckCircleFillIcon />
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex-row justify-between"
                  onClick={() => {
                    setVisibilityType("public");
                  }}
                >
                  <div className="flex flex-row items-center gap-2">
                    <GlobeIcon />
                    <span>Public</span>
                  </div>
                  {visibilityType === "public" ? <CheckCircleFillIcon /> : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
            onSelect={() => onDelete(chat.id)}
          >
            <TrashIcon />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
  if (prevProps.isActive !== nextProps.isActive) {
    return false;
  }
  return true;
});
