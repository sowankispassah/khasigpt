"use client";

import dynamic from "next/dynamic";
import type { Session } from "next-auth";
import { PageUserMenu } from "@/components/page-user-menu";

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
