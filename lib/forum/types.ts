import type { ForumPostReactionType, ForumThreadStatus } from "@/lib/db/schema";

export type ForumUserSummary = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
  isAdmin: boolean;
};

export type ForumCategorySummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  isLocked: boolean;
  threadCount: number;
  lastActivityAt: Date | null;
};

export type ForumTagSummary = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  usageCount: number;
};

export type ForumThreadListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  status: ForumThreadStatus;
  isPinned: boolean;
  isLocked: boolean;
  totalReplies: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastRepliedAt: Date | null;
  category: {
    id: string;
    slug: string;
    name: string;
  };
  author: ForumUserSummary;
  lastResponder: ForumUserSummary | null;
  tags: Array<{
    id: string;
    slug: string;
    label: string;
  }>;
};

export type ForumPostListItem = {
  id: string;
  threadId: string;
  author: ForumUserSummary;
  content: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  parentPostId: string | null;
  reactions: Record<ForumPostReactionType, number>;
};

export type ForumOverviewResult = {
  categories: ForumCategorySummary[];
  tags: ForumTagSummary[];
  threads: ForumThreadListItem[];
  hasMore: boolean;
  nextCursor: string | null;
  activeCategoryId: string | null;
  activeTagId: string | null;
  subscribedThreadIds: string[];
};

export type ForumThreadDetailResult = {
  thread: ForumThreadListItem;
  posts: ForumPostListItem[];
  isSubscribed: boolean;
  viewerReactions: Record<string, ForumPostReactionType[]>;
};

export type ForumOverviewPayload = Omit<ForumOverviewResult, "threads"> & {
  threads: ForumThreadListItemPayload[];
};

export type ForumThreadDetailPayload = Omit<
  ForumThreadDetailResult,
  "thread" | "posts"
> & {
  thread: ForumThreadListItemPayload;
  posts: ForumPostListItemPayload[];
};

export type CreateForumCategoryInput = {
  name: string;
  slug?: string | null;
  description?: string | null;
  position?: number;
  isLocked?: boolean;
};

export type ForumThreadListItemPayload = Omit<
  ForumThreadListItem,
  "createdAt" | "updatedAt" | "lastRepliedAt"
> & {
  createdAt: string;
  updatedAt: string;
  lastRepliedAt: string | null;
};

export type ForumPostListItemPayload = Omit<
  ForumPostListItem,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};
