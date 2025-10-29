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

export function AppSidebar({
  user,
}: {
  user: User | undefined;
}) {
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
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-8 px-2 md:h-fit md:px-2"
                    data-testid="new-chat-button"
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={handleNewChat}
                    type="button"
                    variant="outline"
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
                <TooltipContent align="end">
                  New Chat
                </TooltipContent>
              </Tooltip>

              <div className="md:hidden">
                {status === "loading" ? (
                  <Button className="h-8 w-8" disabled variant="outline">
                    <span className="sr-only">Loading user menu</span>
                    <span className="animate-spin"><LoaderIcon size={16} /></span>
                  </Button>
                ) : activeUser ? (
                  <UserDropdownMenu
                    align="end"
                    isAdmin={isAdmin}
                    onNavigate={(path) => {
                      setOpenMobile(false);
                      router.push(path);
                    }}
                    onSignOut={() => {
                      setOpenMobile(false);
                      signOut({ redirectTo: "/login" });
                    }}
                    onToggleTheme={() => {
                      setTheme(resolvedTheme === "dark" ? "light" : "dark");
                      setOpenMobile(false);
                    }}
                    resolvedTheme={resolvedTheme}
                    side="bottom"
                    userEmail={activeUser.email ?? undefined}
                    trigger={
                      <UserMenuTrigger
                        className="px-1.5"
                        user={{
                          name: activeUser.name,
                          email: activeUser.email,
                          imageVersion: activeUser.imageVersion ?? null,
                        }}
                      />
                    }
                  />
                ) : null}
              </div>
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

