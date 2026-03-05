import { fetchWithTimeout } from "@/lib/utils/async";
import {
  looksBlockedHtml,
  parseRetryAfterMs,
  parsePositiveInt,
  sleep,
} from "./scraper-utils";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 750;
const DEFAULT_MAX_RETRY_DELAY_MS = 12_000;
const DEFAULT_HOST_COOLDOWN_MS = 7_000;
const DEFAULT_MAX_BODY_BYTES = 25 * 1024 * 1024;

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type FetchRequestOptions = {
  timeoutMs?: number;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
  maxBodyBytes?: number;
  headers?: HeadersInit;
  accept?: string;
};

type FetchTextResult = {
  url: string;
  status: number;
  headers: Headers;
  text: string;
};

type FetchBufferResult = {
  url: string;
  status: number;
  headers: Headers;
  buffer: Buffer;
};

type RequestFailure = {
  status: number | null;
  reason: string;
};

function parseHost(value: string) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value;
  }
}

function retryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(25, baseDelayMs));
  return Math.min(maxDelayMs, exponential + jitter);
}

async function readBodyAsBuffer(response: Response, maxBytes: number) {
  if (!response.body) {
    throw new Error("Response body is empty.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.length;
      if (total > maxBytes) {
        throw new Error("Response exceeds configured max body bytes.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export class RobustHttpClient {
  private readonly hostCooldownUntil = new Map<string, number>();
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetryAttempts: number;
  private readonly defaultRetryBaseDelayMs: number;
  private readonly defaultMaxRetryDelayMs: number;
  private readonly defaultHostCooldownMs: number;
  private readonly defaultMaxBodyBytes: number;
  private readonly userAgent: string;

  constructor() {
    this.defaultTimeoutMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_REQUEST_TIMEOUT_MS ?? process.env.JOBS_SCRAPE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    );
    this.defaultRetryAttempts = parsePositiveInt(
      process.env.JOBS_SCRAPE_REQUEST_RETRY_ATTEMPTS ??
        process.env.JOBS_SCRAPE_FETCH_RETRY_ATTEMPTS,
      DEFAULT_RETRY_ATTEMPTS
    );
    this.defaultRetryBaseDelayMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_REQUEST_RETRY_BASE_DELAY_MS,
      DEFAULT_RETRY_BASE_DELAY_MS
    );
    this.defaultMaxRetryDelayMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_REQUEST_RETRY_MAX_DELAY_MS,
      DEFAULT_MAX_RETRY_DELAY_MS
    );
    this.defaultHostCooldownMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_HOST_COOLDOWN_MS,
      DEFAULT_HOST_COOLDOWN_MS
    );
    this.defaultMaxBodyBytes = parsePositiveInt(
      process.env.JOBS_SCRAPE_MAX_RESPONSE_BYTES,
      DEFAULT_MAX_BODY_BYTES
    );
    this.userAgent = process.env.JOBS_SCRAPE_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
  }

  async fetchText(url: string, options: FetchRequestOptions = {}): Promise<FetchTextResult> {
    return this.withRetry(url, options, async (response) => {
      const text = await response.text();
      if ((response.status === 403 || response.status === 503) && looksBlockedHtml(text)) {
        throw new Error("blocked_by_anti_bot");
      }
      return {
        url: response.url || url,
        status: response.status,
        headers: response.headers,
        text,
      };
    });
  }

  async fetchBuffer(url: string, options: FetchRequestOptions = {}): Promise<FetchBufferResult> {
    const maxBodyBytes =
      options.maxBodyBytes && options.maxBodyBytes > 0
        ? Math.trunc(options.maxBodyBytes)
        : this.defaultMaxBodyBytes;
    return this.withRetry(url, options, async (response) => {
      const contentLengthRaw = response.headers.get("content-length");
      if (contentLengthRaw) {
        const contentLength = Number.parseInt(contentLengthRaw, 10);
        if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
          throw new Error("response_too_large");
        }
      }
      const buffer = await readBodyAsBuffer(response, maxBodyBytes);
      if (buffer.length === 0) {
        throw new Error("empty_response_body");
      }
      return {
        url: response.url || url,
        status: response.status,
        headers: response.headers,
        buffer,
      };
    });
  }

  private async withRetry<T>(
    url: string,
    options: FetchRequestOptions,
    responseReader: (response: Response) => Promise<T>
  ): Promise<T> {
    const timeoutMs =
      options.timeoutMs && options.timeoutMs > 0
        ? Math.trunc(options.timeoutMs)
        : this.defaultTimeoutMs;
    const retryAttempts =
      options.retryAttempts && options.retryAttempts > 0
        ? Math.trunc(options.retryAttempts)
        : this.defaultRetryAttempts;
    const retryBaseDelayMs =
      options.retryBaseDelayMs && options.retryBaseDelayMs > 0
        ? Math.trunc(options.retryBaseDelayMs)
        : this.defaultRetryBaseDelayMs;
    const maxRetryDelayMs =
      options.maxRetryDelayMs && options.maxRetryDelayMs > 0
        ? Math.trunc(options.maxRetryDelayMs)
        : this.defaultMaxRetryDelayMs;

    let lastFailure: RequestFailure | null = null;
    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      await this.waitForHostCooldown(url);
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: "GET",
            redirect: "follow",
            cache: "no-store",
            headers: {
              "user-agent": this.userAgent,
              accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
              ...options.headers,
            },
          },
          timeoutMs
        );

        if (!response.ok) {
          const retryable = RETRYABLE_STATUSES.has(response.status);
          const bodyText = await response.text().catch(() => "");
          const blocked =
            response.status === 403 &&
            bodyText.length > 0 &&
            looksBlockedHtml(bodyText);
          lastFailure = {
            status: response.status,
            reason: blocked
              ? "blocked_by_anti_bot"
              : retryable
                ? `retryable_http_${response.status}`
                : `http_${response.status}`,
          };

          if (!retryable && !blocked) {
            throw new Error(`HTTP ${response.status}`);
          }

          const retryAfterMs = parseRetryAfterMs(
            response.headers.get("retry-after"),
            retryDelayMs(attempt, retryBaseDelayMs, maxRetryDelayMs)
          );
          this.setHostCooldown(url, retryAfterMs);
          if (attempt < retryAttempts) {
            await sleep(retryAfterMs);
            continue;
          }
          throw new Error(lastFailure.reason);
        }

        return await responseReader(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryableError =
          message === "timeout" ||
          message === "blocked_by_anti_bot" ||
          message === "response_too_large" ||
          message === "empty_response_body" ||
          /fetch failed|network|socket|timed out|aborted/i.test(message);

        lastFailure = {
          status: null,
          reason: message,
        };

        if (!retryableError || attempt >= retryAttempts) {
          throw error instanceof Error
            ? error
            : new Error("Request failed for unknown reason.");
        }

        const delayMs = retryDelayMs(attempt, retryBaseDelayMs, maxRetryDelayMs);
        this.setHostCooldown(url, delayMs);
        await sleep(delayMs);
      }
    }

    throw new Error(lastFailure?.reason ?? "request_failed");
  }

  private async waitForHostCooldown(url: string) {
    const host = parseHost(url);
    const cooldownUntil = this.hostCooldownUntil.get(host) ?? 0;
    const remaining = cooldownUntil - Date.now();
    if (remaining > 0) {
      await sleep(remaining);
    }
  }

  private setHostCooldown(url: string, ms: number) {
    const host = parseHost(url);
    const cooldownMs = ms > 0 ? ms : this.defaultHostCooldownMs;
    this.hostCooldownUntil.set(host, Date.now() + cooldownMs);
  }
}
