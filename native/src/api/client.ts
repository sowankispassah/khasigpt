import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
  BalanceSummary,
  BootstrapPayload,
  ChatHistoryItem,
  ChatHistoryResponse,
  ChatMessage,
  ForumCategory,
  ForumOverview,
  ForumReactionType,
  ForumThreadDetail,
  JobDetailsPayload,
  JobListItem,
  PricingPlan,
  SessionPayload,
  UploadedAttachment,
} from "./types";

const rawConfiguredBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "http://10.0.2.2:3000";
const configuredBaseUrl =
  Platform.OS === "web"
    ? (() => {
        const browserOrigin =
          typeof window !== "undefined" ? window.location.origin : "";
        if (
          browserOrigin.includes("localhost") ||
          browserOrigin.includes("127.0.0.1")
        ) {
          return "http://localhost:3000";
        }
        return rawConfiguredBaseUrl
          .replace("10.0.2.2", "localhost")
          .replace("127.0.0.1", "localhost");
      })()
    : __DEV__
      ? "http://localhost:3000"
    : rawConfiguredBaseUrl;

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 8000;

function getBaseUrlCandidates() {
  const candidates = [API_BASE_URL];
  if (Platform.OS !== "web") {
    if (API_BASE_URL.includes("localhost")) {
      candidates.push(API_BASE_URL.replace("localhost", "127.0.0.1"));
    } else if (API_BASE_URL.includes("127.0.0.1")) {
      candidates.push(API_BASE_URL.replace("127.0.0.1", "localhost"));
    }
  }
  return [...new Set(candidates)];
}

type RequestOptions = RequestInit & {
  json?: unknown;
  timeoutMs?: number;
};

async function parseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiFetch<T>(
  path: string,
  { json, headers, timeoutMs, ...options }: RequestOptions = {}
): Promise<T> {
  let lastError: unknown = null;

  for (const baseUrl of getBaseUrlCandidates()) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs ?? REQUEST_TIMEOUT_MS
    );
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        credentials: "include",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(json ? { "Content-Type": "application/json" } : null),
          ...headers,
        },
        body: json ? JSON.stringify(json) : options.body,
      });

      const body = await parseBody(response);
      if (!response.ok) {
        const message =
          typeof body === "object" && body && "message" in body
            ? String((body as { message?: unknown }).message)
            : typeof body === "object" && body && "error" in body
              ? String((body as { error?: unknown }).error)
              : `Request failed with ${response.status}`;
        throw new Error(message);
      }

      return body as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

export async function clearServerCookies() {
  if (Platform.OS === "web") {
    return;
  }

  const cookieModule = require("@react-native-cookies/cookies");
  const CookieManager = (cookieModule.default ?? cookieModule) as {
    clearAll: (useWebKit?: boolean) => Promise<boolean>;
  };
  await CookieManager.clearAll(true).catch(() => undefined);
}

export const api = {
  bootstrap: (languageCode?: string | null) =>
    apiFetch<BootstrapPayload>(
      languageCode
        ? `/api/mobile/bootstrap?lang=${encodeURIComponent(languageCode)}`
        : "/api/mobile/bootstrap"
    ),
  billingPlans: () =>
    apiFetch<{
      recommendedPlanId: string | null;
      balance: BalanceSummary;
      plans: PricingPlan[];
    }>("/api/mobile/billing/plans"),
  chatHistory: ({
    endingBefore,
    limit = 20,
    mode = "all",
  }: {
    endingBefore?: string | null;
    limit?: number;
    mode?: "all" | "default" | "study" | "jobs";
  } = {}) =>
    apiFetch<ChatHistoryResponse>(
      `/api/history?limit=${limit}${
        mode === "all" ? "" : `&mode=${mode}`
      }${
        endingBefore ? `&ending_before=${encodeURIComponent(endingBefore)}` : ""
      }`
    ),
  chatMessages: (
    chatId: string,
    {
      before,
      limit = 8,
    }: {
      before?: string | null;
      limit?: number;
    } = {}
  ) =>
    apiFetch<{
      messages: ChatMessage[];
      hasMore: boolean;
      oldestMessageAt: string | null;
    }>(
      `/api/chat/${encodeURIComponent(chatId)}/messages?limit=${limit}${
        before ? `&before=${encodeURIComponent(before)}` : ""
      }`
    ),
  deleteChat: (chatId: string) =>
    apiFetch<ChatHistoryItem | null>(
      `/api/chat?id=${encodeURIComponent(chatId)}`,
      {
        method: "DELETE",
      }
    ),
  deleteTrailingMessages: (messageId: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/mobile/chat/messages/${encodeURIComponent(messageId)}/trailing`,
      {
        method: "DELETE",
      }
    ),
  updateChatVisibility: (
    chatId: string,
    visibility: "private" | "public"
  ) =>
    apiFetch<{ ok: boolean }>(
      `/api/mobile/chat/${encodeURIComponent(chatId)}/visibility`,
      {
        method: "PATCH",
        json: { visibility },
      }
    ),
  generateImage: (input: {
    chatId: string;
    visibility: "private" | "public";
    prompt: string;
    displayPrompt?: string;
    userMessageId?: string;
    imageUrls?: string[];
  }) =>
    apiFetch<{
      assistantMessage?: ChatMessage;
      message?: string;
    }>("/api/images", {
      method: "POST",
      json: input,
      timeoutMs: 180000,
    }),
  uploadFile: async (input: {
    uri: string;
    name: string;
    mimeType: string;
  }) => {
    const formData = new FormData();
    formData.append("file", {
      uri: input.uri,
      name: input.name,
      type: input.mimeType,
    } as unknown as Blob);

    const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    });
    const body = await parseBody(response);
    if (!response.ok) {
      const message =
        typeof body === "object" && body && "error" in body
          ? String((body as { error?: unknown }).error)
          : "Failed to upload image.";
      throw new Error(message);
    }
    const data = body as {
      url?: string;
      pathname?: string;
      contentType?: string;
    };
    if (!data.url) {
      throw new Error("Upload failed.");
    }
    return {
      url: data.url,
      name: data.pathname ?? input.name,
      contentType: data.contentType ?? input.mimeType,
    } satisfies UploadedAttachment;
  },
  csrf: () => apiFetch<{ csrfToken: string }>("/api/auth/csrf"),
  forumCategories: () => apiFetch<ForumCategory[]>("/api/forum/categories"),
  forumThreads: ({
    category,
    cursor,
    limit = 15,
    search,
    tag,
  }: {
    category?: string | null;
    cursor?: string | null;
    limit?: number;
    search?: string | null;
    tag?: string | null;
  } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (category) params.set("category", category);
    if (cursor) params.set("cursor", cursor);
    if (search) params.set("search", search);
    if (tag) params.set("tag", tag);
    const query = params.toString();
    return apiFetch<ForumOverview>(`/api/forum/threads${query ? `?${query}` : ""}`);
  },
  forumThread: (slug: string) =>
    apiFetch<ForumThreadDetail>(
      `/api/forum/threads/${encodeURIComponent(slug)}`
    ),
  createForumThread: (input: {
    title: string;
    content: string;
    summary?: string;
    categorySlug: string;
    tagSlugs?: string[];
  }) =>
    apiFetch<{ id: string; slug: string }>("/api/forum/threads", {
      method: "POST",
      json: input,
    }),
  createForumReply: (
    slug: string,
    input: { content: string; parentPostId?: string | null }
  ) =>
    apiFetch<{ id: string; threadId: string }>(
      `/api/forum/threads/${encodeURIComponent(slug)}/posts`,
      {
        method: "POST",
        json: input,
      }
    ),
  toggleForumPostReaction: (
    postId: string,
    input: { type: ForumReactionType }
  ) =>
    apiFetch<{ active: boolean }>(
      `/api/forum/posts/${encodeURIComponent(postId)}/reactions`,
      {
        method: "POST",
        json: input,
      }
    ),
  toggleForumSubscription: (slug: string, subscribe: boolean) =>
    apiFetch<{ subscribed: boolean }>(
      `/api/forum/threads/${encodeURIComponent(slug)}/subscribe`,
      {
        method: "POST",
        json: { subscribe },
      }
    ),
  updateForumThreadStatus: (slug: string, action: "resolve" | "reopen") =>
    apiFetch<{ ok: boolean; status: string }>(
      `/api/forum/threads/${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        json: { action },
      }
    ),
  deleteForumThread: (slug: string) =>
    apiFetch<{ ok: boolean }>(`/api/forum/threads/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    }),
  recordForumThreadView: (slug: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/forum/threads/${encodeURIComponent(slug)}/views`,
      {
        method: "POST",
      }
    ),
  jobDetails: (jobId: string) =>
    apiFetch<JobDetailsPayload>(`/api/mobile/jobs/${encodeURIComponent(jobId)}`),
  jobs: () => apiFetch<JobListItem[]>("/api/jobs/list"),
  profile: () =>
    apiFetch<{
      user: {
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        name: string;
        dateOfBirth: string | null;
        role: string;
        allowPersonalKnowledge: boolean;
        avatar: string | null;
      };
    }>("/api/mobile/profile"),
  profileAvatarDelete: () =>
    apiFetch<{ image: string | null; ok: boolean; updatedAt?: string | null }>(
      "/api/mobile/profile/avatar",
      {
        method: "DELETE",
      }
    ),
  profileAvatarUpload: async (input: {
    base64: string;
    mimeType: string;
    name: string;
  }) => {
    return apiFetch<{ image: string; ok: boolean; updatedAt?: string | null }>(
      "/api/mobile/profile/avatar",
      {
        method: "POST",
        json: {
          base64: input.base64,
          fileName: input.name,
          mimeType: input.mimeType,
        },
        timeoutMs: 60000,
      }
    );
  },
  register: (input: {
    email: string;
    password: string;
    acceptTerms: boolean;
  }) => apiFetch<{ status: string }>("/api/mobile/auth/register", {
    method: "POST",
    json: input,
  }),
  session: () => apiFetch<SessionPayload>("/api/auth/session"),
  siteLaunch: () =>
    apiFetch<{
      publicLaunched: boolean;
      underMaintenance: boolean;
      inviteOnlyPrelaunch: boolean;
    }>("/api/public/site-launch"),
  translateText: (input: {
    sourceText: string;
    targetLanguageCode: string;
  }) =>
    apiFetch<{ translatedText: string; message?: string }>("/api/translate", {
      method: "POST",
      json: {
        mode: "text",
        ...input,
      },
    }),
  updateProfile: (input: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  }) =>
    apiFetch<{ ok: boolean }>("/api/mobile/profile", {
      method: "PATCH",
      json: input,
    }),
  updateProfilePassword: (input: {
    confirmPassword: string;
    password: string;
  }) =>
    apiFetch<{ ok: boolean }>("/api/profile/password", {
      method: "PATCH",
      json: input,
    }),
};

export async function loginWithCredentials(email: string, password: string) {
  const { csrfToken } = await api.csrf();
  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("email", email);
  form.set("password", password);
  form.set("redirect", "false");
  form.set("json", "true");

  const response = await fetch(
    `${API_BASE_URL}/api/auth/callback/credentials?json=true`,
    {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    }
  );

  const body = await parseBody(response);
  if (response.type === "opaqueredirect" || response.status === 0) {
    return;
  }

  if (!response.ok || (body && typeof body === "object" && "error" in body)) {
    throw new Error("Invalid credentials. Please try again.");
  }

  return;
}

export async function loginWithMobileToken(token: string) {
  const { csrfToken } = await api.csrf();
  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("token", token);
  form.set("redirect", "false");
  form.set("json", "true");

  const response = await fetch(
    `${API_BASE_URL}/api/auth/callback/mobile-token?json=true`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    }
  );

  const body = await parseBody(response);
  if (!response.ok || (body && typeof body === "object" && "error" in body)) {
    throw new Error("Unable to complete Google sign in.");
  }

  return;
}

export async function signOut() {
  const { csrfToken } = await api.csrf();
  const form = new URLSearchParams();
  form.set("csrfToken", csrfToken);
  form.set("redirect", "false");
  form.set("json", "true");

  await fetch(`${API_BASE_URL}/api/auth/signout?json=true`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => undefined);

  await clearServerCookies();
}
