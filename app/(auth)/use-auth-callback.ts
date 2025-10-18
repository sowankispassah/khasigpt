"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CALLBACK_STORAGE_KEY = "auth.callbackUrl";

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

export function useAuthCallback(defaultUrl = "/") {
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

  return { callbackUrl, setCallbackUrl: updateCallback, clearCallback };
}
