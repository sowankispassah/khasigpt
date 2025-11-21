"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

function createBrowserClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase browser client is not configured.");
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }

  return browserClient;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const client = createBrowserClient();
  if (!client) return null;

  hydrateSupabaseSessionFromInjectedStorage(client);
  return client;
}

export function hydrateSupabaseSessionFromInjectedStorage(
  client: SupabaseClient
) {
  if (typeof window === "undefined") return;

  const value = window.localStorage.getItem("__session");
  if (!value) return;

  try {
    const session = JSON.parse(value) as Session;
    void client.auth.setSession(session);
  } catch (error) {
    console.error("Unable to hydrate Supabase session", error);
  }
}
