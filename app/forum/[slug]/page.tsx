import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ThreadDetailClient } from "@/components/forum/thread-detail-client";
import { isForumEnabledForRole } from "@/lib/forum/config";
import {
  type ForumPostListItem,
  type ForumThreadListItem,
  getForumThreadDetail,
} from "@/lib/forum/service";
import type {
  ForumPostListItemPayload,
  ForumThreadDetailPayload,
  ForumThreadListItemPayload,
} from "@/lib/forum/types";

export const dynamic = "force-dynamic";

function serializeThread(
  thread: ForumThreadListItem
): ForumThreadListItemPayload {
  return {
    ...thread,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastRepliedAt: thread.lastRepliedAt
      ? thread.lastRepliedAt.toISOString()
      : null,
  };
}

function serializePost(post: ForumPostListItem): ForumPostListItemPayload {
  return {
    ...post,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

type ThreadPageParams = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ThreadPageParams): Promise<Metadata> {
  const session = await auth();
  const forumEnabled = await isForumEnabledForRole(session?.user?.role ?? null);
  if (!forumEnabled) {
    return {
      title: "Forum Thread",
    };
  }
  const { slug } = await params;
  const detail = await getForumThreadDetail({
    slug,
    viewerUserId: null,
  });

  if (!detail) {
    return {
      title: "Forum Thread",
    };
  }

  return {
    title: `${detail.thread.title} – Forum`,
    description: detail.thread.summary.slice(0, 160),
  };
}

export default async function ThreadPage({ params }: ThreadPageParams) {
  const session = await auth();
  const forumEnabled = await isForumEnabledForRole(session?.user?.role ?? null);
  if (!forumEnabled) {
    notFound();
  }
  const { slug } = await params;
  const detail = await getForumThreadDetail({
    slug,
    viewerUserId: session?.user?.id ?? null,
  });

  if (!detail) {
    notFound();
  }

  const payload: ForumThreadDetailPayload = {
    ...detail,
    thread: serializeThread(detail.thread),
    posts: detail.posts.map(serializePost),
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <ThreadDetailClient
        initialDetail={payload}
        viewer={{
          id: session?.user?.id ?? null,
          name: session?.user?.name ?? null,
          firstName: session?.user?.firstName ?? null,
          lastName: session?.user?.lastName ?? null,
          email: session?.user?.email ?? null,
          role: (session?.user?.role as "admin" | "regular" | null) ?? null,
          imageVersion: session?.user?.imageVersion ?? null,
        }}
      />
    </div>
  );
}
