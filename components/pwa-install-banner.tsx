"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("khasigpt-pwa-dismissed");
      if (stored === "1") {
        setDismissed(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const persistDismissed = useCallback(() => {
    setDeferredPrompt(null);
    setDismissed(true);
    try {
      localStorage.setItem("khasigpt-pwa-dismissed", "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((error) => console.error("[pwa] failed to register sw", error));
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }
    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      if (typeof promptEvent.prompt !== "function") {
        return;
      }
      event.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () =>
      setIsStandalone(mediaQuery.matches || (window.navigator as any).standalone);
    updateStandalone();

    const handler = (event: MediaQueryListEvent) => setIsStandalone(event.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, []);

  const canShow = useMemo(() => {
    return !isStandalone && !dismissed && deferredPrompt;
  }, [deferredPrompt, dismissed, isStandalone]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      persistDismissed();
    } else {
      persistDismissed();
    }
  }, [deferredPrompt, persistDismissed]);

  if (!canShow) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70 md:inset-x-auto md:right-6 md:max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold">Install KhasiGPT</p>
          <p className="text-muted-foreground text-xs">
            Use KhasiGPT like a native app. Works offline with instant access from
            your home screen.
          </p>
        </div>
        <button
          aria-label="Dismiss install prompt"
          className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"
          onClick={persistDismissed}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button className="cursor-pointer flex-1" onClick={handleInstall}>
          Add to home screen
        </Button>
        <Button className="cursor-pointer" onClick={persistDismissed} type="button" variant="ghost">
          Maybe later
        </Button>
      </div>
    </div>
  );
}
