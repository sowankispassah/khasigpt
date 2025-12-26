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
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

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

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { data: sessionData } = useSession();
  const [isPending, startTransition] = useTransition();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      clearTimeout(timerId);
    }
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
    startProgress();
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
      startProgress();
      startTransition(() => {
        setOpenMobile(false);
        router.push("/");
      });
    },
    [isPending, router, setOpenMobile, startProgress]
  );

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
                      <PlusIcon />
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
    </>
  );
}
