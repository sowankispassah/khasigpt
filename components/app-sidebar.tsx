"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useSession } from "next-auth/react";
import {
  type MouseEvent,
  useCallback,
  useTransition,
} from "react";
import { BookOpen } from "lucide-react";
import { PlusIcon } from "@/components/icons";
import { startGlobalProgress } from "@/lib/ui/global-progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

const SidebarHistory = dynamic(
  () =>
    import("@/components/sidebar-history").then(
      (module) => module.SidebarHistory
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-4 px-2 py-3">
        <div className="h-3 w-16 animate-pulse rounded bg-sidebar-accent-foreground/15" />
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((item) => (
            <div
              className="flex h-8 animate-pulse items-center gap-2 rounded-md bg-sidebar-accent-foreground/10 px-2"
              key={item}
            >
              <div className="h-4 w-5 rounded-full bg-sidebar-accent-foreground/20" />
              <div className="h-3 flex-1 rounded bg-sidebar-accent-foreground/20" />
            </div>
          ))}
        </div>
      </div>
    ),
  }
);

export function AppSidebar({
  user,
  studyModeEnabled = false,
}: {
  user: User | undefined;
  studyModeEnabled?: boolean;
}) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { data: sessionData } = useSession();
  const [isPending, startTransition] = useTransition();

  const activeUser = sessionData?.user ?? user;
  const _userEmail = activeUser?.email ?? "";
  const _isAdmin = activeUser?.role === "admin";

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
    startGlobalProgress();
    startTransition(() => {
      setOpenMobile(false);
      router.push(targetHref);
    });
  };

  const createNewStudyHref = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `/chat?mode=study&new=${crypto.randomUUID()}`;
    }
    return `/chat?mode=study&new=${Date.now().toString(36)}`;
  };

  const handleNewStudy = () => {
    if (isPending) {
      return;
    }
    const targetHref = createNewStudyHref();
    startGlobalProgress();
    startTransition(() => {
      setOpenMobile(false);
      router.push(targetHref);
    });
  };

  const handleLogoClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      if (isPending) {
        return;
      }
      startGlobalProgress();
      startTransition(() => {
        setOpenMobile(false);
        router.push("/");
      });
    },
    [isPending, router, setOpenMobile]
  );

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <Link
              className="flex cursor-pointer flex-row items-center"
              href="/"
              onClick={handleLogoClick}
            >
              <Image
                alt="KhasiGPT logo"
                className="h-8 w-6 rounded-md object-contain dark:brightness-150 dark:invert"
                height={32}
                priority
                src="/images/khasigptlogo.png"
                width={24}
              />
              <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                KhasiGPT
              </span>
            </Link>
            <div className="md:hidden" />
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="mt-5 px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-busy={isPending}
                className="cursor-pointer text-sm"
                onClick={handleNewChat}
                type="button"
              >
                <PlusIcon />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {studyModeEnabled ? (
              <SidebarMenuItem>
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      aria-busy={isPending}
                      className="cursor-pointer text-sm"
                      type="button"
                    >
                      <BookOpen />
                      <span>Study</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <div className="flex flex-col gap-1">
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            aria-busy={isPending}
                            className="cursor-pointer text-sm"
                            onClick={handleNewStudy}
                            type="button"
                          >
                            <PlusIcon />
                            <span>New Study</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                      <div className="ml-[5px]">
                        <SidebarHistory mode="study" user={user} />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </div>
        <SidebarSeparator />
        <SidebarHistory user={user} />
      </SidebarContent>
    </Sidebar>
  );
}
