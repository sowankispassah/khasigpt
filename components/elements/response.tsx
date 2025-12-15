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

function useStreamdownComponent() {
  const [component, setComponent] = useState<StreamdownComponent | null>(
    cachedStreamdown
  );

  useEffect(() => {
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
  }, []);

  return component;
}

type ResponseProps = {
  className?: string;
  children: ReactNode;
};

export const Response = memo(
  ({ className, children }: ResponseProps) => {
    const content = typeof children === "string" ? sanitizeText(children) : null;
    const Streamdown = useStreamdownComponent();

    return (
      <div
        className={cn(
          "size-full min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto",
          className
        )}
      >
        {content === null ? (
          children
        ) : Streamdown ? (
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
