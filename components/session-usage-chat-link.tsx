"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useTransition,
} from "react";
import { startGlobalProgress } from "@/lib/ui/global-progress";

type SessionUsageChatLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export function SessionUsageChatLink({
  href,
  children,
  className,
}: SessionUsageChatLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      if (isPending) {
        return;
      }

      startGlobalProgress();
      startTransition(() => {
        router.push(href);
      });
    },
    [href, isPending, router]
  );

  return (
    <Link className={className} href={href} onClick={handleClick} prefetch>
      {children}
    </Link>
  );
}
