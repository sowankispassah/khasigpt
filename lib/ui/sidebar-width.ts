export const DEFAULT_SIDEBAR_WIDTH = 256;

export function maxSidebarWidth(viewportWidth: number) {
  return Math.max(DEFAULT_SIDEBAR_WIDTH, Math.min(480, viewportWidth - 384));
}

export function clampSidebarWidth(width: number, viewportWidth: number) {
  return Math.max(DEFAULT_SIDEBAR_WIDTH, Math.min(width, maxSidebarWidth(viewportWidth)));
}
