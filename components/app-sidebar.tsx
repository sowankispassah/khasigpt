"use client";

import { BookOpen, BriefcaseBusiness, Calculator } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useSession } from "next-auth/react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { PlusIcon } from "@/components/icons";
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
import { startGlobalProgress } from "@/lib/ui/global-progress";

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

// These force a server rerender so `/chat` generates a fresh chat id, then the
// Chat UI strips `new` back out via router.replace.
const HOME_HREF = "/chat";
const JOBS_HREF = "/jobs";
const NEW_CHAT_HREF = "/chat?new=1";
const NEW_JOBS_HREF = "/chat?mode=jobs&new=1";
const NEW_STUDY_HREF = "/chat?mode=study&new=1";

export function AppSidebar({
  calculatorEnabled = true,
  jobsModeEnabled = false,
  user,
  studyModeEnabled = false,
}: {
  calculatorEnabled?: boolean;
  jobsModeEnabled?: boolean;
  user: User | undefined;
  studyModeEnabled?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const { data: sessionData } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationFingerprint = `${pathname}?${searchParams.toString()}`;
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] = useState<
    "home" | "chat" | "study" | "jobs" | "calculator" | null
  >(null);

  const activeUser = sessionData?.user ?? user;

  useEffect(() => {
    void navigationFingerprint;
    // Close the mobile sidebar after navigation completes (avoid delaying URL change).
    setOpenMobile(false);
    setPendingNavigation(null);
  }, [navigationFingerprint, setOpenMobile]);

  const shouldHandleClientNavigation = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
      !(
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ),
    []
  );

  const navigateWithFeedback = useCallback(
    (target: "home" | "chat" | "study" | "jobs" | "calculator", href: string) => {
      if (pendingNavigation) {
        return;
      }

      setPendingNavigation(target);
      startGlobalProgress();
      setOpenMobile(false);
      router.push(href, { scroll: false });
    },
    [pendingNavigation, router, setOpenMobile]
  );

  const handleHomeClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const href = `${HOME_HREF}?new=1&nonce=${Date.now()}`;
      navigateWithFeedback("home", href);
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleNewChatClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const href = `${NEW_CHAT_HREF}&nonce=${Date.now()}`;
      navigateWithFeedback("chat", href);
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleNewStudyClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const href = `${NEW_STUDY_HREF}&nonce=${Date.now()}`;
      navigateWithFeedback("study", href);
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleCalculatorClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }
      event.preventDefault();
      if (pathname === "/calculator") {
        setOpenMobile(false);
        return;
      }
      navigateWithFeedback("calculator", "/calculator");
    },
    [navigateWithFeedback, pathname, setOpenMobile, shouldHandleClientNavigation]
  );

  const handleJobsClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }
      event.preventDefault();
      if (pathname === "/jobs" || pathname.startsWith("/jobs/")) {
        setOpenMobile(false);
        return;
      }
      navigateWithFeedback("jobs", JOBS_HREF);
    },
    [
      navigateWithFeedback,
      pathname,
      setOpenMobile,
      shouldHandleClientNavigation,
    ]
  );

  const handleNewJobsClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const href = `${NEW_JOBS_HREF}&nonce=${Date.now()}`;
      navigateWithFeedback("jobs", href);
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <Link
              className="flex cursor-pointer flex-row items-center"
              href={HOME_HREF}
              onClick={handleHomeClick}
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
                {pendingNavigation === "home" ? "Opening..." : "KhasiGPT"}
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
              <SidebarMenuButton asChild className="cursor-pointer text-sm">
                <Link
                  aria-disabled={pendingNavigation !== null}
                  href={NEW_CHAT_HREF}
                  onClick={handleNewChatClick}
                >
                  <PlusIcon />
                  <span>
                    {pendingNavigation === "chat" ? "Opening..." : "New chat"}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {studyModeEnabled ? (
              <SidebarMenuItem>
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton className="cursor-pointer text-sm" type="button">
                      <BookOpen />
                      <span>Study</span>
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1">
                    <div className="flex flex-col gap-1">
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton asChild className="cursor-pointer text-sm">
                            <Link
                              aria-disabled={pendingNavigation !== null}
                              href={NEW_STUDY_HREF}
                              onClick={handleNewStudyClick}
                            >
                              <PlusIcon />
                              <span>
                                {pendingNavigation === "study"
                                  ? "Opening..."
                                  : "New Study"}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>

                      <div className="ml-[5px]">
                        <SidebarHistory mode="study" user={activeUser ?? user} />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            ) : null}
            {jobsModeEnabled ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="cursor-pointer text-sm">
                  <Link
                    aria-disabled={pendingNavigation !== null}
                    href={JOBS_HREF}
                    onClick={handleJobsClick}
                  >
                    <BriefcaseBusiness />
                    <span>
                      {pendingNavigation === "jobs" ? "Opening..." : "Jobs"}
                    </span>
                  </Link>
                </SidebarMenuButton>
                <div className="mt-1 ml-[5px] flex flex-col gap-1">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild className="cursor-pointer text-sm">
                        <Link
                          aria-disabled={pendingNavigation !== null}
                          href={NEW_JOBS_HREF}
                          onClick={handleNewJobsClick}
                        >
                          <PlusIcon />
                          <span>
                            {pendingNavigation === "jobs" ? "Opening..." : "New Jobs"}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>

                  <div className="ml-[5px]">
                    <SidebarHistory mode="jobs" user={activeUser ?? user} />
                  </div>
                </div>
              </SidebarMenuItem>
            ) : null}
            {calculatorEnabled ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="cursor-pointer text-sm">
                  <Link
                    aria-disabled={pendingNavigation !== null}
                    href="/calculator"
                    onClick={handleCalculatorClick}
                  >
                    <Calculator />
                    <span>
                      {pendingNavigation === "calculator"
                        ? "Opening..."
                        : "Calculator"}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </div>
        <SidebarSeparator />
        <SidebarHistory user={activeUser ?? user} />
      </SidebarContent>
    </Sidebar>
  );
}
