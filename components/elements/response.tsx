"use client";

import type { ComponentType } from "react";
import { memo, type ReactNode, useEffect, useState } from "react";
import { cn, sanitizeText } from "@/lib/utils";

type StreamdownComponent = ComponentType<{
  children: string;
  className?: string;
}>;

let cachedStreamdown: StreamdownComponent | null = null;
let streamdownPromise: Promise<StreamdownComponent> | null = null;

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
  const [component, setComponent] = useState<StreamdownComponent | null>(
    cachedStreamdown
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (cachedStreamdown) {
      return;
    }

    if (!streamdownPromise) {
      streamdownPromise = import("streamdown")
        .then((mod) => mod.Streamdown as unknown as StreamdownComponent)
        .then((loaded) => {
          cachedStreamdown = loaded;
          return loaded;
        });
    }

    streamdownPromise
      .then((loaded) => {
        setComponent(() => loaded);
      })
      .catch(() => {
        // best-effort
      });
  }, [enabled]);

  return component;
}

type ResponseProps = {
  className?: string;
  children: ReactNode;
};

export const Response = memo(
  ({ className, children }: ResponseProps) => {
    const content = typeof children === "string" ? sanitizeText(children) : null;
    const wantsMarkdown = content !== null && shouldLoadStreamdown(content);
    const Streamdown = useStreamdownComponent(wantsMarkdown);

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
          <Streamdown>{content}</Streamdown>
        ) : (
          <div className="whitespace-pre-wrap break-words">{content}</div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
