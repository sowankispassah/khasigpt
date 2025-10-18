"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useTransition } from "react";
import { LoaderIcon, PlusIcon } from "@/components/icons";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({
  user,
}: {
  user: User | undefined;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [isPending, startTransition] = useTransition();

  const createNewChatHref = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `/?new=${crypto.randomUUID()}`;
    }
    return `/?new=${Date.now().toString(36)}`;
  };

  const handleNewChat = () => {
    if (isPending) {
      return;
    }
    const targetHref = createNewChatHref();
    startTransition(() => {
      setOpenMobile(false);
      router.push(targetHref);
    });
  };

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <Link
              className="flex flex-row items-center gap-3"
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
            >
              <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                Chatbot
              </span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 p-1 md:h-fit md:p-2"
                  data-testid="new-chat-button"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={handleNewChat}
                  type="button"
                  variant="ghost"
                >
                  {isPending ? (
                    <span className="flex items-center justify-center animate-spin">
                      <LoaderIcon size={16} />
                    </span>
                  ) : (
                    <PlusIcon />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end" className="hidden md:block">
                New Chat
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}

