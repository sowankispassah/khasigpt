"use client";

import { EllipsisVertical } from "lucide-react";
import dynamic from "next/dynamic";
import type { Session } from "next-auth";

const PageUserMenu = dynamic(
  () => import("@/components/page-user-menu").then((module) => module.PageUserMenu),
  {
    ssr: false,
    loading: () => (
      <div className="fixed top-1.5 right-2 z-40 flex items-center">
        <button
          aria-label="Open menu"
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground"
          type="button"
        >
          <span className="sr-only">Open menu</span>
          <EllipsisVertical aria-hidden="true" size={16} />
        </button>
      </div>
    ),
  }
);

const UserPresenceTracker = dynamic(
  () =>
    import("@/components/user-presence-tracker").then(
      (module) => module.UserPresenceTracker
    ),
  {
    ssr: false,
  }
);

type SiteShellExtrasProps = {
  forumEnabled: boolean;
  sessionUser: Session["user"] | null;
};

export function SiteShellExtras({
  forumEnabled,
  sessionUser,
}: SiteShellExtrasProps) {
  return (
    <>
      <PageUserMenu forumEnabled={forumEnabled} initialUser={sessionUser} />
      {sessionUser?.id ? <UserPresenceTracker userId={sessionUser.id} /> : null}
    </>
  );
}
