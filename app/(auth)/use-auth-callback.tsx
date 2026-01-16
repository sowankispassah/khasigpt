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
      sessionStorage.setItem(CALLBACK_STORAGE_KEY, paramValue);
      setCallbackUrl(paramValue);
      removeCallbackParamFromUrl();
      return;
    }

    const storedValue = sessionStorage.getItem(CALLBACK_STORAGE_KEY);
    if (storedValue) {
      setCallbackUrl(storedValue);
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
    if (typeof window !== "undefined") {
      sessionStorage.setItem(CALLBACK_STORAGE_KEY, value);
    }
    setCallbackUrl(value);
  }, []);

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
