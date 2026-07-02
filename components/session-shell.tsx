"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

type SessionShellProps = {
  children: React.ReactNode;
  session?: Session | null;
};

export function SessionShell({ children, session }: SessionShellProps) {
  const providerProps =
    typeof session === "undefined" ? {} : { session: session };

  return (
    <SessionProvider {...providerProps} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
