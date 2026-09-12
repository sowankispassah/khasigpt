"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

const CALLBACK_STORAGE_KEY = "auth.callbackUrl";

type AuthCallbackValue = {
  callbackUrl: string;
  setCallbackUrl: (value: string) => void;
  clearCallback: () => void;
};

const AuthCallbackContext = createContext<AuthCallbackValue | null>(null);

function removeCallbackParamFromUrl() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("callbackUrl");

  const nextUrl =
    url.pathname +
    (url.searchParams.toString().length > 0
      ? `?${url.searchParams.toString()}`
      : "") +
    url.hash;

  window.history.replaceState(window.history.state, "", nextUrl);
}

function useAuthCallbackValue(defaultUrl = "/"): AuthCallbackValue {
  const searchParams = useSearchParams();
  const [callbackUrl, setCallbackUrl] = useState(defaultUrl);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const paramValue = searchParams?.get("callbackUrl");
    if (paramValue) {
      const safeCallback = sanitizeRedirectPath(
        paramValue,
        window.location.origin,
        defaultUrl
      );
      sessionStorage.setItem(CALLBACK_STORAGE_KEY, safeCallback);
      setCallbackUrl(safeCallback);
      removeCallbackParamFromUrl();
      return;
    }

    const storedValue = sessionStorage.getItem(CALLBACK_STORAGE_KEY);
    if (storedValue) {
      const safeStored = sanitizeRedirectPath(
        storedValue,
        window.location.origin,
        defaultUrl
      );
      setCallbackUrl(safeStored);
    } else {
      setCallbackUrl(defaultUrl);
    }
  }, [defaultUrl, searchParams]);

  const clearCallback = useCallback(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(CALLBACK_STORAGE_KEY);
    }
  }, []);

  const updateCallback = useCallback((value: string) => {
    const safeValue =
      typeof window !== "undefined"
        ? sanitizeRedirectPath(value, window.location.origin, defaultUrl)
        : value;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(CALLBACK_STORAGE_KEY, safeValue);
    }
    setCallbackUrl(safeValue);
  }, [defaultUrl]);

  return useMemo(
    () => ({
      callbackUrl,
      setCallbackUrl: updateCallback,
      clearCallback,
    }),
    [callbackUrl, updateCallback, clearCallback]
  );
}

function AuthCallbackProviderInner({
  children,
  defaultUrl,
}: {
  children: ReactNode;
  defaultUrl?: string;
}) {
  const value = useAuthCallbackValue(defaultUrl);

  return (
    <AuthCallbackContext.Provider value={value}>
      {children}
    </AuthCallbackContext.Provider>
  );
}

export function AuthCallbackProvider({
  children,
  defaultUrl = "/",
}: {
  children: ReactNode;
  defaultUrl?: string;
}) {
  return (
    <Suspense fallback={null}>
      <AuthCallbackProviderInner defaultUrl={defaultUrl}>
        {children}
      </AuthCallbackProviderInner>
    </Suspense>
  );
}

export function useAuthCallback() {
  const context = useContext(AuthCallbackContext);

  if (!context) {
    throw new Error(
      "useAuthCallback must be used within an AuthCallbackProvider"
    );
  }

  return context;
}
