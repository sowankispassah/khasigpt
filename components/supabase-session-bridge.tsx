"use client";

import { useEffect } from "react";

import {
  getSupabaseBrowserClient,
  hydrateSupabaseSessionFromInjectedStorage,
} from "@/lib/supabase/browser-client";

export function SupabaseSessionBridge() {
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    hydrateSupabaseSessionFromInjectedStorage(client);

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (typeof window === "undefined") return;
      if (session) {
        window.localStorage.setItem("__session", JSON.stringify(session));
      } else {
        window.localStorage.removeItem("__session");
      }
    });

    return () => data?.subscription.unsubscribe();
  }, []);

  return null;
}
