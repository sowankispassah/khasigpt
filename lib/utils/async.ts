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
    const cancelable = promise as Promise<T> & { cancel?: () => void | Promise<unknown> };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        onTimeout?.();
      } catch {
        // ignore errors inside timeout callback
      }
      try {
        void Promise.resolve(cancelable.cancel?.()).catch(() => undefined);
      } catch {
        // ignore cancellation failures
      }
      reject(new Error("timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve(value);
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
  return fetchWithResponseTimeout(input, init, timeoutMs, (response) => response);
}

// Keep the deadline and caller cancellation active while reading the body.
// fetch() resolves at headers; a JSON body can still stall after that point.
export async function fetchWithResponseTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  read: (response: Response) => T | Promise<T>
): Promise<T> {
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    return read(await fetch(input, init));
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
    return await withTimeout(
      fetch(input, { ...init, signal: controller.signal }).then(read),
      timeoutMs,
      () => controller.abort()
    );
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && abortListener) {
      externalSignal.removeEventListener("abort", abortListener);
    }
  }
}
