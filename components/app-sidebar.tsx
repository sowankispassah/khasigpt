"use client";

import {
  AudioLines,
  BriefcaseBusiness,
  Calculator,
  GraduationCap,
  Languages,
  Loader2,
  type LucideIcon,
  MapPin,
  Newspaper,
  SquarePen,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useSession } from "next-auth/react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { preloadChat } from "@/components/chat-loader";
import { useTranslation } from "@/components/language-provider";
import { SidebarSectionLabel } from "@/components/sidebar/sidebar-section-label";
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle";
import {
  EditableTranslation,
  useTranslationEdit,
} from "@/components/translation-edit-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { buildPendingChatHref } from "@/lib/chat/navigation";
import {
  doneGlobalProgress,
  startGlobalProgress,
} from "@/lib/ui/global-progress";
import { generateUUID } from "@/lib/utils";
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";

const SidebarHistory = dynamic(
  () =>
    import("@/components/sidebar-history").then(
      (module) => module.SidebarHistory
    ),
  {
    ssr: false,
    loading: () => <SidebarHistorySkeleton />,
  }
);

function SidebarHistorySkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-1 px-2">
      <div className="mx-2.5 mb-2 h-3 w-20 animate-pulse rounded bg-sidebar-accent-foreground/10" />
      {[68, 52, 80, 44, 60].map((width) => (
        <div className="flex h-9 items-center gap-2.5 rounded-lg px-2.5" key={width}>
          <div className="size-3.5 shrink-0 animate-pulse rounded bg-sidebar-accent-foreground/10" />
          <div
            className="h-3 animate-pulse rounded bg-sidebar-accent-foreground/10"
            style={{ width: `${width}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// These request a fresh `/chat` render so a new chat id is generated, then the
// Chat UI strips `new` back out of the URL.
const HOME_HREF = "/chat";
const NEW_CHAT_HREF = "/chat?new=1";
const TRANSLATE_HREF = "/translate";
const LIVE_TRANSLATION_HREF = "/live-translation";
const NEW_STUDY_HREF = "/chat?mode=study&new=1";
const VIEW_JOBS_HREF = "/chat?mode=jobs&new=1";
const NEWS_HREF = "/chat?mode=news&new=1";
const CALCULATOR_HREF = "/calculator";
const EXPLORE_HREF = "/explore";
const JOBS_LIST_API_ROUTE = "/api/jobs/list";

function isChatShellPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/chat");
}

function SidebarEditableMenuLabel({
  defaultText,
  translationKey,
}: {
  defaultText: string;
  translationKey: string;
}) {
  const { translate } = useTranslation();
  const { enabled, isAdmin, openEditor } = useTranslationEdit();
  const text = translate(translationKey, defaultText);

  if (!isAdmin || !enabled) {
    return <span className="truncate">{text}</span>;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: The inline translation edit trigger is embedded in sidebar link text and must not nest a button inside that link.
    <span
      className="inline-flex max-w-full cursor-pointer rounded-sm border border-amber-500/70 border-dashed px-0.5 leading-5"
      data-translation-key={translationKey}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor({ defaultText, key: translationKey });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openEditor({ defaultText, key: translationKey });
        }
      }}
      role="button"
      tabIndex={0}
      title={translationKey}
    >
      {text}
    </span>
  );
}

export function AppSidebar({
  calculatorEnabled = true,
  exploreMeghalayaEnabled = false,
  jobsModeEnabled = false,
  translateEnabled = false,
  liveTranslationEnabled = false,
  newsEnabled = false,
  user,
  studyModeEnabled = false,
}: {
  calculatorEnabled?: boolean;
  exploreMeghalayaEnabled?: boolean;
  jobsModeEnabled?: boolean;
  translateEnabled?: boolean;
  liveTranslationEnabled?: boolean;
  newsEnabled?: boolean;
  user: User | undefined;
  studyModeEnabled?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const { translate } = useTranslation();
  const { data: sessionData } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationFingerprint = `${pathname}?${searchParams.toString()}`;
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] = useState<
    | "home"
    | "chat"
    | "translate"
    | "live-translation"
    | "study"
    | "jobs"
    | "news"
    | "calculator"
    | "explore"
    | null
  >(null);

  const activeUser = sessionData?.user ?? user;

  useEffect(() => {
    void navigationFingerprint;
    // Close the mobile sidebar after navigation completes (avoid delaying URL change).
    setOpenMobile(false);
    setPendingNavigation(null);
    doneGlobalProgress();
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

  const prefetchRoute = useCallback(
    (href: string) => {
      if (!shouldPrefetch()) {
        return;
      }

      try {
        router.prefetch(href);
      } catch (error) {
        console.warn("Prefetch route failed", error);
      }
    },
    [router]
  );

  const prefetchChatRoute = useCallback(
    (href: string) => {
      prefetchRoute(href);
      preloadChat();
    },
    [prefetchRoute]
  );

  const prefetchJobsModeData = useCallback(() => {
    if (!shouldPrefetch()) {
      return;
    }

    void fetch(JOBS_LIST_API_ROUTE, {
      credentials: "same-origin",
    }).catch((error) => {
      console.warn("Prefetch jobs list failed", error);
    });
  }, []);

  const navigateWithFeedback = useCallback(
    (
      target:
        | "home"
        | "chat"
        | "translate"
        | "live-translation"
        | "study"
        | "jobs"
        | "news"
        | "calculator"
        | "explore",
      href: string
    ) => {
      if (pendingNavigation) {
        return;
      }

      setPendingNavigation(target);
      startGlobalProgress();
      if (
        target !== "calculator" &&
        target !== "explore" &&
        target !== "translate" &&
        target !== "live-translation"
      ) {
        preloadChat();
      }
      setOpenMobile(false);

      if (
        target !== "calculator" &&
        target !== "explore" &&
        target !== "translate" &&
        target !== "live-translation" &&
        isChatShellPath(pathname)
      ) {
        if (typeof window !== "undefined") {
          window.history.pushState(null, "", href);
        }
        return;
      }

      router.push(href, { scroll: false });
    },
    [pathname, pendingNavigation, router, setOpenMobile]
  );

  useEffect(() => {
    if (!shouldPrefetch()) {
      return;
    }

    const idleHandle = runWhenIdle(() => {
      prefetchChatRoute(NEW_CHAT_HREF);
      if (translateEnabled) {
        prefetchRoute(TRANSLATE_HREF);
      }
      if (liveTranslationEnabled) {
        prefetchRoute(LIVE_TRANSLATION_HREF);
      }
      if (studyModeEnabled) {
        prefetchChatRoute(NEW_STUDY_HREF);
      }
      if (jobsModeEnabled) {
        prefetchChatRoute(VIEW_JOBS_HREF);
        prefetchJobsModeData();
      }
      if (newsEnabled) {
        prefetchChatRoute(NEWS_HREF);
      }
      if (calculatorEnabled) {
        prefetchRoute(CALCULATOR_HREF);
      }
      if (exploreMeghalayaEnabled) {
        prefetchRoute(EXPLORE_HREF);
      }
    }, 300);

    return () => {
      cancelIdle(idleHandle);
    };
  }, [
    calculatorEnabled,
    exploreMeghalayaEnabled,
    jobsModeEnabled,
    prefetchChatRoute,
    prefetchJobsModeData,
    prefetchRoute,
    studyModeEnabled,
    translateEnabled,
    liveTranslationEnabled,
    newsEnabled,
  ]);

  const handleHomeClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const href = buildPendingChatHref({
        href: NEW_CHAT_HREF,
        pendingChatId: generateUUID(),
      });
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

      navigateWithFeedback(
        "chat",
        buildPendingChatHref({
          href: NEW_CHAT_HREF,
          pendingChatId: generateUUID(),
        })
      );
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleNewStudyClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      navigateWithFeedback(
        "study",
        buildPendingChatHref({
          href: NEW_STUDY_HREF,
          pendingChatId: generateUUID(),
        })
      );
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleNewsClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }
      event.preventDefault();

      navigateWithFeedback(
        "news",
        buildPendingChatHref({
          href: NEWS_HREF,
          pendingChatId: generateUUID(),
        })
      );
    },
    [navigateWithFeedback, shouldHandleClientNavigation]
  );

  const handleNewsPrefetch = useCallback(() => {
    prefetchChatRoute(NEWS_HREF);
  }, [prefetchChatRoute]);

  const handleTranslateClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      if (pathname === TRANSLATE_HREF) {
        setOpenMobile(false);
        return;
      }

      navigateWithFeedback("translate", TRANSLATE_HREF);
    },
    [navigateWithFeedback, pathname, setOpenMobile, shouldHandleClientNavigation]
  );

  const handleTranslatePrefetch = useCallback(() => {
    prefetchRoute(TRANSLATE_HREF);
  }, [prefetchRoute]);

  const handleLiveTranslationClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      if (pathname === LIVE_TRANSLATION_HREF) {
        setOpenMobile(false);
        return;
      }

      navigateWithFeedback("live-translation", LIVE_TRANSLATION_HREF);
    },
    [navigateWithFeedback, pathname, setOpenMobile, shouldHandleClientNavigation]
  );

  const handleLiveTranslationPrefetch = useCallback(() => {
    prefetchRoute(LIVE_TRANSLATION_HREF);
  }, [prefetchRoute]);

  const handleCalculatorClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }
      event.preventDefault();
      if (pathname === CALCULATOR_HREF) {
        setOpenMobile(false);
        return;
      }
      navigateWithFeedback("calculator", CALCULATOR_HREF);
    },
    [navigateWithFeedback, pathname, setOpenMobile, shouldHandleClientNavigation]
  );

  const handleCalculatorPrefetch = useCallback(() => {
    prefetchRoute(CALCULATOR_HREF);
  }, [prefetchRoute]);

  const handleExploreClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) return;
      event.preventDefault();
      if (pathname === EXPLORE_HREF) {
        setOpenMobile(false);
        return;
      }
      navigateWithFeedback("explore", EXPLORE_HREF);
    },
    [navigateWithFeedback, pathname, setOpenMobile, shouldHandleClientNavigation]
  );

  const handleExplorePrefetch = useCallback(() => {
    prefetchRoute(EXPLORE_HREF);
  }, [prefetchRoute]);

  const handleViewJobsClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!shouldHandleClientNavigation(event)) {
        return;
      }

      event.preventDefault();

      const currentMode = searchParams.get("mode");
      const currentJobId = searchParams.get("jobId");
      if (
        (pathname === "/" || pathname === "/chat") &&
        currentMode === "jobs" &&
        !currentJobId
      ) {
        setOpenMobile(false);
        return;
      }

      navigateWithFeedback(
        "jobs",
        buildPendingChatHref({
          href: VIEW_JOBS_HREF,
          pendingChatId: generateUUID(),
        })
      );
    },
    [
      navigateWithFeedback,
      pathname,
      searchParams,
      setOpenMobile,
      shouldHandleClientNavigation,
    ]
  );

  const handleViewJobsPrefetch = useCallback(() => {
    prefetchChatRoute(VIEW_JOBS_HREF);
    prefetchJobsModeData();
  }, [prefetchChatRoute, prefetchJobsModeData]);

  const searchMode = searchParams.get("mode");
  const isChatRootPath = pathname === "/" || pathname === "/chat";
  const isOnPath = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const activeTool:
    | "translate"
    | "live-translation"
    | "study"
    | "jobs"
    | "news"
    | "calculator"
    | "explore"
    | null = isOnPath(TRANSLATE_HREF)
    ? "translate"
    : isOnPath(LIVE_TRANSLATION_HREF)
      ? "live-translation"
      : isOnPath(CALCULATOR_HREF)
        ? "calculator"
        : isOnPath(EXPLORE_HREF)
          ? "explore"
          : isChatRootPath && searchMode === "study"
            ? "study"
            : isChatRootPath && searchMode === "jobs"
              ? "jobs"
              : isChatRootPath && searchMode === "news"
                ? "news"
                : null;
  const hasTools =
    translateEnabled ||
    liveTranslationEnabled ||
    studyModeEnabled ||
    jobsModeEnabled ||
    newsEnabled ||
    calculatorEnabled ||
    exploreMeghalayaEnabled;
  const isNavigationPending = pendingNavigation !== null;

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader className="gap-3 px-2 pt-3 pb-2">
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between gap-2">
            <Link
              className="flex min-w-0 cursor-pointer flex-row items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-sidebar-accent/60"
              href={HOME_HREF}
              onClick={handleHomeClick}
            >
              <Image
                alt="KhasiGPT logo"
                className="h-7 w-5 shrink-0 rounded-md object-contain dark:brightness-150 dark:invert"
                height={28}
                priority
                src="/images/khasigptlogo.png"
                width={20}
              />
              <span className="truncate font-semibold text-base tracking-tight">
                {pendingNavigation === "home" ? (
                  <EditableTranslation
                    defaultText="Opening..."
                    translationKey="navigation.opening"
                  />
                ) : (
                  <EditableTranslation
                    defaultText="KhasiGPT"
                    description="Application brand name in the sidebar header."
                    translationKey="app.brand"
                  />
                )}
              </span>
            </Link>
            <button
              aria-label={translate("sidebar.close", "Close sidebar")}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
              onClick={() => setOpenMobile(false)}
              title={translate("sidebar.close", "Close sidebar")}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        </SidebarMenu>
        <Link
          aria-busy={pendingNavigation === "chat"}
          aria-disabled={isNavigationPending}
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-sidebar-border bg-background px-3 font-medium text-sidebar-foreground text-sm shadow-xs transition hover:bg-sidebar-accent aria-disabled:pointer-events-none aria-disabled:opacity-70"
          href={NEW_CHAT_HREF}
          onClick={handleNewChatClick}
        >
          {pendingNavigation === "chat" ? (
            <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
          ) : (
            <SquarePen aria-hidden="true" className="size-4 shrink-0" />
          )}
          {pendingNavigation === "chat" ? (
            <SidebarEditableMenuLabel
              defaultText="Opening..."
              translationKey="navigation.opening"
            />
          ) : (
            <SidebarEditableMenuLabel
              defaultText="New chat"
              translationKey="sidebar.new_chat"
            />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-4 pb-4">
        {hasTools ? (
          <section className="px-2">
            <SidebarSectionLabel>
              <EditableTranslation
                defaultText="Tools"
                description="Sidebar heading above the tool links such as Translate, Study mode and Calculator."
                translationKey="sidebar.section.tools"
              />
            </SidebarSectionLabel>
            <SidebarMenu className="gap-0.5">
              {translateEnabled ? (
                <SidebarNavRow
                  active={activeTool === "translate"}
                  defaultText="Translate"
                  disabled={isNavigationPending}
                  href={TRANSLATE_HREF}
                  icon={Languages}
                  onClick={handleTranslateClick}
                  onPrefetch={handleTranslatePrefetch}
                  pending={pendingNavigation === "translate"}
                  translationKey="sidebar.translate"
                />
              ) : null}
              {liveTranslationEnabled ? (
                <SidebarNavRow
                  active={activeTool === "live-translation"}
                  defaultText="Live Translation"
                  disabled={isNavigationPending}
                  href={LIVE_TRANSLATION_HREF}
                  icon={AudioLines}
                  onClick={handleLiveTranslationClick}
                  onPrefetch={handleLiveTranslationPrefetch}
                  pending={pendingNavigation === "live-translation"}
                  translationKey="sidebar.live_translation"
                />
              ) : null}
              {studyModeEnabled ? (
                <SidebarNavRow
                  active={activeTool === "study"}
                  defaultText="Study Mode"
                  disabled={isNavigationPending}
                  href={NEW_STUDY_HREF}
                  icon={GraduationCap}
                  onClick={handleNewStudyClick}
                  pending={pendingNavigation === "study"}
                  translationKey="sidebar.study_mode"
                />
              ) : null}
              {jobsModeEnabled ? (
                <SidebarNavRow
                  active={activeTool === "jobs"}
                  defaultText="Jobs"
                  disabled={isNavigationPending}
                  href={VIEW_JOBS_HREF}
                  icon={BriefcaseBusiness}
                  onClick={handleViewJobsClick}
                  onPrefetch={handleViewJobsPrefetch}
                  pending={pendingNavigation === "jobs"}
                  translationKey="sidebar.jobs"
                />
              ) : null}
              {newsEnabled ? (
                <SidebarNavRow
                  active={activeTool === "news"}
                  defaultText="News"
                  disabled={isNavigationPending}
                  href={NEWS_HREF}
                  icon={Newspaper}
                  onClick={handleNewsClick}
                  onPrefetch={handleNewsPrefetch}
                  pending={pendingNavigation === "news"}
                  translationKey="sidebar.news"
                />
              ) : null}
              {calculatorEnabled ? (
                <SidebarNavRow
                  active={activeTool === "calculator"}
                  defaultText="Calculator"
                  disabled={isNavigationPending}
                  href={CALCULATOR_HREF}
                  icon={Calculator}
                  onClick={handleCalculatorClick}
                  onPrefetch={handleCalculatorPrefetch}
                  pending={pendingNavigation === "calculator"}
                  translationKey="sidebar.calculator"
                />
              ) : null}
              {exploreMeghalayaEnabled ? (
                <SidebarNavRow
                  active={activeTool === "explore"}
                  defaultText="Nearby"
                  disabled={isNavigationPending}
                  href={EXPLORE_HREF}
                  icon={MapPin}
                  onClick={handleExploreClick}
                  onPrefetch={handleExplorePrefetch}
                  pending={pendingNavigation === "explore"}
                  translationKey="sidebar.nearby"
                />
              ) : null}
            </SidebarMenu>
          </section>
        ) : null}
        <SidebarHistory
          label="Chat History"
          labelKey="sidebar.history.title"
          mode="all"
          showNewsHistory={newsEnabled}
          user={activeUser ?? user}
        />
      </SidebarContent>
      <SidebarResizeHandle />
    </Sidebar>
  );
}

function SidebarNavRow({
  active,
  defaultText,
  disabled,
  href,
  icon: Icon,
  onClick,
  onPrefetch,
  pending,
  translationKey,
}: {
  active: boolean;
  defaultText: string;
  disabled: boolean;
  href: string;
  icon: LucideIcon;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onPrefetch?: () => void;
  pending: boolean;
  translationKey: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="group/nav-row h-9 cursor-pointer gap-2.5 rounded-lg px-2.5 text-sidebar-foreground/85 hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
        isActive={active}
      >
        <Link
          aria-busy={pending}
          aria-current={active ? "page" : undefined}
          aria-disabled={disabled}
          href={href}
          onClick={onClick}
          onFocus={onPrefetch}
          onMouseEnter={onPrefetch}
          onTouchStart={onPrefetch}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin text-sidebar-foreground/60" />
          ) : (
            <Icon
              aria-hidden="true"
              className="text-sidebar-foreground/55 transition-colors group-hover/nav-row:text-sidebar-foreground/80 group-data-[active=true]/nav-row:text-sidebar-accent-foreground"
            />
          )}
          {pending ? (
            <SidebarEditableMenuLabel
              defaultText="Opening..."
              translationKey="navigation.opening"
            />
          ) : (
            <SidebarEditableMenuLabel
              defaultText={defaultText}
              translationKey={translationKey}
            />
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
