export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const cancelable = promise as Promise<T> & { cancel?: () => void };
    const canCancel = typeof cancelable.cancel === "function";

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      timedOut = true;
      try {
        onTimeout?.();
      } catch {
        // ignore errors inside timeout callback
      }

      // Non-cancellable promises, especially postgres/drizzle queries, must be
      // allowed to settle so serverless functions do not abandon DB reads and
      // leave Supavisor sessions stuck in ClientRead.
      if (canCancel) {
        settled = true;
        try {
          cancelable.cancel?.();
        } catch {
          // ignore cancellation failures
        }
        reject(new Error("timeout"));
      }
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error("timeout"));
        } else {
          resolve(value);
        }
      })
      .catch((error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
) {
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init?.signal ?? null;
  let abortListener: (() => void) | null = null;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      abortListener = () => controller.abort();
      externalSignal.addEventListener("abort", abortListener, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && abortListener) {
      externalSignal.removeEventListener("abort", abortListener);
    }
  }
}
