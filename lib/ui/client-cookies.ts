"use client";

type BrowserCookieStore = {
  set: (options: {
    expires?: number;
    name: string;
    path?: string;
    sameSite?: "lax" | "strict" | "none";
    value: string;
  }) => Promise<void>;
};

export function setClientCookie({
  maxAge,
  name,
  path = "/",
  sameSite = "lax",
  value,
}: {
  maxAge: number;
  name: string;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  value: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const encodedValue = encodeURIComponent(value);
  const cookieStore = (window as Window & { cookieStore?: BrowserCookieStore })
    .cookieStore;

  if (cookieStore) {
    void cookieStore.set({
      expires: Date.now() + maxAge * 1000,
      name,
      path,
      sameSite,
      value: encodedValue,
    });
    return;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store is not available in every embedded/native WebView.
  document.cookie = `${name}=${encodedValue}; path=${path}; max-age=${maxAge}; samesite=${sameSite}`;
}
