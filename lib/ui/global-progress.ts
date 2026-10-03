const GLOBAL_PROGRESS_START_EVENT = "app:global-progress:start";
const GLOBAL_PROGRESS_DONE_EVENT = "app:global-progress:done";

function dispatchGlobalProgressEvent(name: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(name));
}

export function startGlobalProgress() {
  dispatchGlobalProgressEvent(GLOBAL_PROGRESS_START_EVENT);
}

export function doneGlobalProgress() {
  dispatchGlobalProgressEvent(GLOBAL_PROGRESS_DONE_EVENT);
}

export function addGlobalProgressStartListener(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(GLOBAL_PROGRESS_START_EVENT, listener);
  return () => window.removeEventListener(GLOBAL_PROGRESS_START_EVENT, listener);
}

export function addGlobalProgressDoneListener(listener: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(GLOBAL_PROGRESS_DONE_EVENT, listener);
  return () => window.removeEventListener(GLOBAL_PROGRESS_DONE_EVENT, listener);
}
