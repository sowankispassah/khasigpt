import { getExtra } from "@/utils/expo-extra";

const extra = getExtra();
const API_BASE_URL: string =
  extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpOptions = RequestInit & {
  raw?: boolean;
};

const defaultHeaders: HeadersInit = {
  Accept: "application/json",
};

export async function http<T = unknown>(
  path: string,
  { raw = false, headers, ...init }: HttpOptions = {}
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
  }

  const url = buildUrl(path);
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...defaultHeaders,
      ...(headers ?? {}),
    },
  });

  if (raw) {
    return response as unknown as T;
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export function buildUrl(path: string) {
  if (path.startsWith("http")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}
