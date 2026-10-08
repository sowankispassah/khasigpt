"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditableTranslation } from "@/components/translation-edit-provider";
import { useSidebar } from "@/components/ui/sidebar";
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH, maxSidebarWidth } from "@/lib/ui/sidebar-width";

export function SidebarResizeHandle() {
  const { isMobile, open, sidebarWidth, setSidebarWidth, setResizing } = useSidebar();
  const [viewportWidth, setViewportWidth] = useState(1024);
  const drag = useRef<{ x: number; width: number; cursor: string; userSelect: string } | null>(null);
  const { text, editButton } = useEditableTranslation("sidebar.resize", "Resize sidebar", "Drag the sidebar's right edge or use arrow keys to change its width.");
  const { text: hint, editButton: hintEdit } = useEditableTranslation("sidebar.resize.hint", "Drag to resize. Use arrow keys to adjust, or double-click to reset.");
  const finish = useCallback(() => {
    if (drag.current) {
      document.body.style.cursor = drag.current.cursor;
      document.body.style.userSelect = drag.current.userSelect;
      drag.current = null;
    }
    setResizing(false);
  }, [setResizing]);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); finish(); };
  }, [finish]);
  useEffect(() => { if (!open || isMobile) finish(); }, [open, isMobile, finish]);
  if (isMobile || !open) return null;
  return <>
    {/* biome-ignore lint/a11y/useSemanticElements: A focusable separator provides the adjustable window-splitter interaction; a static hr does not. */}
    <div
      aria-label={text}
      aria-orientation="vertical"
      aria-valuemin={DEFAULT_SIDEBAR_WIDTH}
      aria-valuemax={maxSidebarWidth(viewportWidth)}
      aria-valuenow={sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH}
      className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:transition-colors hover:after:bg-sidebar-border focus-visible:after:bg-sidebar-border"
      data-sidebar="resize-handle"
      onDoubleClick={() => setSidebarWidth(null)}
      onKeyDown={event => {
        const current = sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
        const step = event.shiftKey ? 32 : 16;
        const width = event.key === "ArrowRight" ? current + step : event.key === "ArrowLeft" ? current - step : event.key === "Home" ? DEFAULT_SIDEBAR_WIDTH : event.key === "End" ? maxSidebarWidth(viewportWidth) : null;
        if (width !== null) { event.preventDefault(); setSidebarWidth(clampSidebarWidth(width, viewportWidth)); }
      }}
      onLostPointerCapture={finish}
      onPointerCancel={finish}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const width = event.currentTarget.closest('[data-sidebar="sidebar"]')?.getBoundingClientRect().width ?? DEFAULT_SIDEBAR_WIDTH;
        drag.current = { x: event.clientX, width, cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        setResizing(true);
      }}
      onPointerMove={event => {
        if (drag.current) setSidebarWidth(clampSidebarWidth(drag.current.width + event.clientX - drag.current.x, window.innerWidth));
      }}
      onPointerUp={event => { finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      role="separator"
      tabIndex={0}
      title={hint}
    />
    {(editButton || hintEdit) ? <div className="absolute right-2 top-12 z-30 flex gap-1">{editButton}{hintEdit}</div> : null}
  </>;
}
