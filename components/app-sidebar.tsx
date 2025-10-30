"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useTransition } from "react";
import { LoaderIcon, PlusIcon } from "@/components/icons";
import { SidebarHistory } from "@/components/sidebar-history";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { UserDropdownMenu, UserMenuTrigger } from "./user-dropdown-menu";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { data: sessionData, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const activeUser = sessionData?.user ?? user;
  const userEmail = activeUser?.email ?? "";
  const isAdmin = activeUser?.role === "admin";

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
              className="flex flex-row items-center"
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
            >
              <img
                alt="KhasiGPT logo"
                className="h-8 w-6.5 rounded-md object-contain"
                height={32}
                src="/images/khasigptlogo.png"
                width={24}
              />
              <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                KhasiGPT
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-busy={isPending}
                    className="h-8 px-2 md:h-fit md:px-2"
                    data-testid="new-chat-button"
                    disabled={isPending}
                    onClick={handleNewChat}
                    type="button"
                    variant="outline"
                  >
                    {isPending ? (
                      <span className="flex animate-spin items-center justify-center">
                        <LoaderIcon size={16} />
                      </span>
                    ) : (
                      <PlusIcon />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent align="end">New Chat</TooltipContent>
              </Tooltip>

              <div className="md:hidden" />
            </div>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarHistory user={user} />
      </SidebarContent>
    </Sidebar>
  );
}
