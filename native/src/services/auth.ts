import { getExtra } from "@/utils/expo-extra";

import { ApiError, buildUrl, http } from "./http";

const extra = getExtra();
const WEB_BASE_URL: string =
  extra.webBaseUrl ?? process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "regular" | "creator" | "admin";
  dateOfBirth: string | null;
  image: string | null;
  imageVersion: string | null;
};

export type SessionResponse = {
  user: SessionUser | null;
  expires: string;
};

type CsrfResponse = {
  csrfToken: string;
};

const defaultCallbackUrl = WEB_BASE_URL || "/";

export async function fetchSession() {
  return http<SessionResponse>("/api/auth/session");
}

export async function fetchCsrfToken() {
  const response = await http<CsrfResponse>("/api/auth/csrf");
  return response.csrfToken;
}

export async function loginWithCredentials(params: {
  email: string;
  password: string;
  csrfToken?: string;
}) {
  const csrfToken = params.csrfToken ?? (await fetchCsrfToken());
  const form = new URLSearchParams({
    csrfToken,
    email: params.email,
    password: params.password,
    redirect: "false",
    json: "true",
    callbackUrl: defaultCallbackUrl,
  });

  const response = await fetch(
    buildUrl("/api/auth/callback/credentials?json=true"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: form.toString(),
      credentials: "include",
    }
  );

  if (!response.ok) {
    let message = "Sign in failed";
    try {
      const errorBody = await response.json();
      if (typeof errorBody?.message === "string") {
        message = errorBody.message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }

  return fetchSession();
}

export async function signOut(csrfToken?: string) {
  const csrf = csrfToken ?? (await fetchCsrfToken());
  const form = new URLSearchParams({
    csrfToken: csrf,
    callbackUrl: defaultCallbackUrl,
    redirect: "false",
  });

  await fetch(buildUrl("/api/auth/signout?json=true"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: form.toString(),
    credentials: "include",
  });
}
