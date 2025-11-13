import { PropsWithChildren, createContext, useContext, useEffect, useState } from "react";

import {
  SessionResponse,
  fetchSession,
  loginWithCredentials,
  signOut,
} from "@/services/auth";
import { useProgressHandle } from "@/hooks/use-progress";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  session: SessionResponse | null;
  user: SessionResponse["user"] | null;
  status: AuthStatus;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const trackProgress = useProgressHandle();

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    const endProgress = trackProgress();
    try {
      const next = await fetchSession();
      setSession(next);
      setStatus(next.user ? "authenticated" : "unauthenticated");
    } catch (error) {
      console.warn("Failed to refresh session", error);
      setSession(null);
      setStatus("unauthenticated");
    } finally {
      endProgress();
    }
  };

  const login = async ({ email, password }: { email: string; password: string }) => {
    const endProgress = trackProgress();
    try {
      await loginWithCredentials({ email, password });
      await refresh();
    } finally {
      endProgress();
    }
  };

  const logout = async () => {
    const endProgress = trackProgress();
    try {
      await signOut();
    } finally {
      endProgress();
      setSession(null);
      setStatus("unauthenticated");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        status,
        refresh,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
