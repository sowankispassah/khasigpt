type IdleHandle =
  | {
      id: number;
      type: "idle" | "timeout";
    }
  | null;

type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

export function shouldPrefetch(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const connection = (navigator as Navigator & { connection?: NavigatorConnection })
    .connection;
  if (!connection) {
    return true;
  }
  if (connection.saveData) {
    return false;
  }
  const effectiveType = connection.effectiveType ?? "";
  return !effectiveType.includes("2g");
}

export function runWhenIdle(
  callback: () => void,
  timeoutMs = 800
): IdleHandle {
  if (typeof window === "undefined") {
    return null;
  }

  const anyWindow = window as typeof window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
  };

  if (typeof anyWindow.requestIdleCallback === "function") {
    return {
      id: anyWindow.requestIdleCallback(callback, { timeout: timeoutMs }),
      type: "idle",
    };
  }

  return {
    id: window.setTimeout(callback, timeoutMs),
    type: "timeout",
  };
}

export function cancelIdle(handle: IdleHandle) {
  if (!handle || typeof window === "undefined") {
    return;
  }

  if (handle.type === "idle") {
    const anyWindow = window as typeof window & {
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof anyWindow.cancelIdleCallback === "function") {
      anyWindow.cancelIdleCallback(handle.id);
      return;
    }
  }

  window.clearTimeout(handle.id);
}
