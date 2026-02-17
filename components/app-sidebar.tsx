"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useSession } from "next-auth/react";
import { BookOpen, Calculator } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
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

// These force a server rerender so `/chat` generates a fresh chat id, then the
// Chat UI strips `new` back out via router.replace.
const HOME_HREF = "/chat";
const NEW_CHAT_HREF = "/chat?new=1";
const NEW_STUDY_HREF = "/chat?mode=study&new=1";

export function AppSidebar({
  calculatorEnabled = true,
  user,
  studyModeEnabled = false,
}: {
  calculatorEnabled?: boolean;
  user: User | undefined;
  studyModeEnabled?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const { data: sessionData } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] = useState<
    "home" | "chat" | "study" | "calculator" | null
  >(null);

  const activeUser = sessionData?.user ?? user;

  useEffect(() => {
    // Close the mobile sidebar after navigation completes (avoid delaying URL change).
    setOpenMobile(false);
    setPendingNavigation(null);
  }, [pathname, searchParams, setOpenMobile]);

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
    (target: "home" | "chat" | "study" | "calculator", href: string) => {
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
