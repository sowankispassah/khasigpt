import { BookOpen, BriefcaseBusiness, MessageSquareText, MoreVertical, Newspaper } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useRef } from "react";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { useStudyContextSummary } from "@/hooks/use-study-context";
import type { ChatHistoryListItem } from "@/lib/db/queries";
import { preloadChat } from "./chat-loader";
import {
  CheckCircleFillIcon,
  GlobeIcon,
  LockIcon,
  ShareIcon,
  TrashIcon,
} from "./icons";
import type { ChatHistoryMode } from "./sidebar-history";
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
  chat: ChatHistoryListItem;
  historyKey?: string;
  historyMode?: ChatHistoryMode;
  isActive: boolean;
  onDelete: (chatId: string) => void;
  onOpen: (chatId: string) => boolean;
  onPrefetch?: (chatId: string) => void;
}) => {
  const href = `/chat/${chat.id}`;
  const hasPrefetchedRef = useRef(false);

  const maybePrefetch = useCallback(() => {
    if (hasPrefetchedRef.current) {
      return;
    }
    hasPrefetchedRef.current = true;
    onPrefetch?.(chat.id);
  }, [onPrefetch, chat.id]);

  const studyContextSummary = useStudyContextSummary(
    chat.mode === "study" ? chat.id : null
  );
  const studyTitle =
    chat.mode === "study"
      ? [studyContextSummary?.exam, studyContextSummary?.role, studyContextSummary?.year]
          .map((part) =>
            typeof part === "string" ? part.trim() : `${part ?? ""}`.trim()
          )
          .filter((part) => part.length > 0)
          .join(" / ")
      : "";
  const displayTitle =
    studyTitle || studyContextSummary?.title?.trim() || chat.title;
  const ChatModeIcon =
    chat.mode === "jobs"
      ? BriefcaseBusiness
      : chat.mode === "study"
        ? BookOpen
        : chat.mode === "news"
          ? Newspaper
        : MessageSquareText;
  const { visibilityType, setVisibilityType } = useChatVisibility({
    chatId: chat.id,
    initialVisibilityType: chat.visibility,
    historyKey,
    historyMode,
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="group/history-row h-9 rounded-lg px-2.5 text-sidebar-foreground/85 hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
        isActive={isActive}
      >
        <Link
          aria-current={isActive ? "page" : undefined}
          className="flex w-full items-center truncate text-left"
          href={href}
          prefetch={false}
          scroll={false}
          onPointerDown={() => {
            preloadChat();
            maybePrefetch();
          }}
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

            const shouldNavigate = onOpen(chat.id);
            if (!shouldNavigate) {
              event.preventDefault();
              return;
            }
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
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <ChatModeIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-sidebar-foreground/45 group-data-[active=true]/history-row:text-sidebar-accent-foreground/80"
            />
            <span className="flex-1 truncate">{displayTitle}</span>
          </span>
        </Link>
      </SidebarMenuButton>

      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="!top-1.5 right-1.5 size-6 rounded-md data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            showOnHover={!isActive}
          >
            <MoreVertical aria-hidden="true" className="size-4" />
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
