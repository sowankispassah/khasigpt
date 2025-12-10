"use client";

import { memo, type ReactNode } from "react";
import { cn, sanitizeText } from "@/lib/utils";

type ResponseProps = {
  className?: string;
  children: ReactNode;
};

export const Response = memo(
  ({ className, children }: ResponseProps) => {
    const content =
      typeof children === "string" ? sanitizeText(children) : children;

    return (
      <div
        className={cn(
          "size-full whitespace-pre-wrap break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_pre]:max-w-full [&_pre]:overflow-x-auto",
          className
        )}
      >
        {content}
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
