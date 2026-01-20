"use client";

import type { ComponentType } from "react";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn, sanitizeText } from "@/lib/utils";

type StreamdownComponent = ComponentType<{
  children: string;
  className?: string;
  rehypePlugins?: any[];
}>;

type LoadedStreamdown = {
  Component: StreamdownComponent;
  rehypePlugins: any[];
};

let cachedStreamdown: LoadedStreamdown | null = null;
let streamdownPromise: Promise<LoadedStreamdown> | null = null;

function shouldLoadStreamdown(content: string) {
  if (!content) {
    return false;
  }

  // Only load the markdown renderer when the message likely contains rich text.
  // This keeps first-load JS smaller for the common case of plain text replies.
  return (
    content.includes("```") ||
    /\[[^\]]+\]\([^)]+\)/.test(content) ||
    /(^|\n)\s{0,3}#{1,6}\s+/.test(content) ||
    /(^|\n)\s{0,3}>\s+/.test(content) ||
    /(^|\n)\s{0,3}([-*+]|\d+\.)\s+/.test(content) ||
    /\*\*[^*]+\*\*/.test(content) ||
    /`[^`]+`/.test(content)
  );
}

function useStreamdownComponent(enabled: boolean) {
  const [state, setState] = useState<LoadedStreamdown | null>(cachedStreamdown);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (cachedStreamdown) {
      return;
    }

    if (!streamdownPromise) {
      streamdownPromise = import("streamdown").then((mod) => {
        const rehypePlugins = Object.entries(mod.defaultRehypePlugins || {})
          .filter(([key]) => key !== "raw")
          .map(([, plugin]) => plugin);
        const Component = mod.Streamdown as unknown as StreamdownComponent;
        const loaded = { Component, rehypePlugins };
        cachedStreamdown = loaded;
        return loaded;
      });
    }

    streamdownPromise
      .then((loaded) => {
        setState(loaded);
      })
      .catch(() => {
        // best-effort
      });
  }, [enabled]);

  return state;
}

type ResponseProps = {
  className?: string;
  children: ReactNode;
};

export const Response = memo(
  ({ className, children }: ResponseProps) => {
    const content = typeof children === "string" ? sanitizeText(children) : null;
    const wantsMarkdown = content !== null && shouldLoadStreamdown(content);
    const loadedStreamdown = useStreamdownComponent(wantsMarkdown);
    const safeRehypePlugins = useMemo(
      () => loadedStreamdown?.rehypePlugins ?? [],
      [loadedStreamdown?.rehypePlugins]
    );
    const Streamdown = loadedStreamdown?.Component ?? null;

    return (
      <div
        className={cn(
          "size-full min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto",
          className
        )}
      >
        {content === null ? (
          children
        ) : Streamdown && wantsMarkdown ? (
          <Streamdown rehypePlugins={safeRehypePlugins}>{content}</Streamdown>
        ) : (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
