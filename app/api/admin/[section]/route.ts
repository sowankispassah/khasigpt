import { asc, count, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api/auth";
import { CACHE_CONTROL, cacheHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadFeatureAccessReadModel,
  loadModelConfigReadModel,
  loadPricingReadModel,
  loadPromptReadModel,
  loadTranslateReadModel,
} from "@/lib/api/read-models";
import {
  db,
  getAuditLogCount,
  getChatCount,
  getContactMessageCount,
  getUserCount,
  listAuditLog,
  listCharactersForAdmin,
  listChats,
  listContactMessages,
  listCouponsWithStats,
  listLanguagesWithSettings,
  listPricingPlans,
  listTranslationEntries,
  listTranslationFeatureLanguagesWithModels,
  listUsers,
} from "@/lib/db/queries";
import type { ContactMessageStatus, UserRole } from "@/lib/db/schema";
import {
  forumCategory,
  forumPost,
  forumThread,
  user as userTable,
} from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getAllLanguages } from "@/lib/i18n/languages";
import { getJobPostingCount, listJobPostingEntries } from "@/lib/jobs/service";
import {
  getRagAnalyticsSummary,
  listAdminRagEntries,
  listRagCategories,
} from "@/lib/rag/service";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_SECTION_QUERY_TIMEOUT_MS = 8000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_FORUM_THREAD_LIMIT = 25;
const DEFAULT_FORUM_POST_LIMIT = 50;

type RouteContext = {
  params: Promise<{ section: string }>;
};

function parsePositiveInt(value: string | null, fallback: number, max = MAX_PAGE_SIZE) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseBooleanFilter(value: string | null): boolean | "all" {
  if (value === "true" || value === "1" || value === "active") {
    return true;
  }
  if (value === "false" || value === "0" || value === "inactive") {
    return false;
  }
  return "all";
}

function parseContactStatus(value: string | null): ContactMessageStatus | "all" {
  return value === "new" ||
    value === "in_progress" ||
    value === "resolved" ||
    value === "archived"
    ? value
    : "all";
}

async function sectionQuery<T>(label: string, promise: Promise<T>, fallback: T) {
  return withApiTiming(
    `admin.${label}`,
    () =>
      withTimeout(promise, ADMIN_SECTION_QUERY_TIMEOUT_MS, () => {
        console.warn(
          `[api/admin/${label}] timed out after ${ADMIN_SECTION_QUERY_TIMEOUT_MS}ms`
        );
      }),
    { slowMs: 1200 }
  ).catch((error) => {
    console.error(`[api/admin/${label}] failed`, error);
    return fallback;
  });
}

async function loadOverview() {
  const [userCount, chatCount, contactMessageCount, recentUsers, recentChats] =
    await Promise.all([
      sectionQuery("overview.user-count", getUserCount(), 0),
      sectionQuery("overview.chat-count", getChatCount(), 0),
      sectionQuery(
        "overview.contact-count",
        getContactMessageCount(),
        0
      ),
      sectionQuery("overview.recent-users", listUsers({ limit: 5 }), []),
      sectionQuery("overview.recent-chats", listChats({ limit: 5 }), []),
    ]);

  return {
    metrics: {
      users: userCount,
      chats: chatCount,
      contactMessages: contactMessageCount,
    },
    recentUsers,
    recentChats,
  };
}

async function loadUsers(searchParams: URLSearchParams) {
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE);
  const offset = (page - 1) * limit;
  const search = searchParams.get("q");
  const roleParam = searchParams.get("role");
  const role =
    roleParam === "admin" || roleParam === "creator" || roleParam === "regular"
      ? (roleParam as UserRole)
      : "all";
  const isActive = parseBooleanFilter(searchParams.get("active"));
  const [items, total] = await Promise.all([
    sectionQuery(
      "users.items",
      listUsers({ isActive, limit, offset, role, search }),
      []
    ),
    sectionQuery("users.total", getUserCount({ isActive, role, search }), 0),
  ]);

  return { items, limit, offset, page, total };
}

async function loadChats(searchParams: URLSearchParams) {
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE);
  const offset = (page - 1) * limit;
  const search = searchParams.get("q");
  const onlyDeleted = searchParams.get("deleted") === "true";
  const [items, total] = await Promise.all([
    sectionQuery(
      "chats.items",
      listChats({ limit, offset, onlyDeleted, search }),
      []
    ),
    sectionQuery("chats.total", getChatCount({ onlyDeleted, search }), 0),
  ]);

  return { items, limit, offset, page, total };
}

async function loadContacts(searchParams: URLSearchParams) {
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE);
  const offset = (page - 1) * limit;
  const search = searchParams.get("q");
  const status = parseContactStatus(searchParams.get("status"));
  const [items, total] = await Promise.all([
    sectionQuery(
      "contacts.items",
      listContactMessages({ limit, offset, search, status }),
      []
    ),
    sectionQuery(
      "contacts.total",
      getContactMessageCount({ search, status }),
      0
    ),
  ]);

  return { items, limit, offset, page, total };
}

async function loadAuditLog(searchParams: URLSearchParams) {
  const page = parsePositiveInt(searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInt(searchParams.get("limit"), 50);
  const offset = (page - 1) * limit;
  const userId = searchParams.get("userId");
  const [items, total] = await Promise.all([
    sectionQuery("audit-log.items", listAuditLog({ limit, offset, userId }), []),
    sectionQuery("audit-log.total", getAuditLogCount({ userId }), 0),
  ]);

  return { items, limit, offset, page, total };
}

async function loadForum(searchParams: URLSearchParams) {
  const threadPage = parsePositiveInt(
    searchParams.get("threadPage"),
    1,
    Number.MAX_SAFE_INTEGER
  );
  const threadLimit = parsePositiveInt(
    searchParams.get("threadLimit"),
    DEFAULT_FORUM_THREAD_LIMIT
  );
  const threadOffset = (threadPage - 1) * threadLimit;
  const postPage = parsePositiveInt(
    searchParams.get("postPage"),
    1,
    Number.MAX_SAFE_INTEGER
  );
  const postLimit = parsePositiveInt(
    searchParams.get("postLimit"),
    DEFAULT_FORUM_POST_LIMIT
  );
  const postOffset = (postPage - 1) * postLimit;

  const [
    categories,
    threads,
    posts,
    totalThreads,
    totalPosts,
    archivedThreads,
    lockedThreads,
    hiddenPosts,
  ] = await Promise.all([
    sectionQuery(
      "forum.categories",
      db
        .select({
          id: forumCategory.id,
          slug: forumCategory.slug,
          name: forumCategory.name,
          description: forumCategory.description,
          position: forumCategory.position,
          isLocked: forumCategory.isLocked,
          createdAt: forumCategory.createdAt,
          updatedAt: forumCategory.updatedAt,
          threadCount: count(forumThread.id),
        })
        .from(forumCategory)
        .leftJoin(forumThread, eq(forumThread.categoryId, forumCategory.id))
        .groupBy(forumCategory.id)
        .orderBy(asc(forumCategory.position), asc(forumCategory.name)),
      []
    ),
    sectionQuery(
      "forum.threads",
      db
        .select({
          id: forumThread.id,
          slug: forumThread.slug,
          title: forumThread.title,
          summary: forumThread.summary,
          status: forumThread.status,
          isPinned: forumThread.isPinned,
          isLocked: forumThread.isLocked,
          totalReplies: forumThread.totalReplies,
          viewCount: forumThread.viewCount,
          createdAt: forumThread.createdAt,
          updatedAt: forumThread.updatedAt,
          categoryId: forumThread.categoryId,
          categoryName: forumCategory.name,
          authorEmail: userTable.email,
          authorFirstName: userTable.firstName,
          authorLastName: userTable.lastName,
        })
        .from(forumThread)
        .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
        .innerJoin(userTable, eq(forumThread.authorId, userTable.id))
        .orderBy(desc(forumThread.updatedAt))
        .limit(threadLimit)
        .offset(threadOffset),
      []
    ),
    sectionQuery(
      "forum.posts",
      db
        .select({
          id: forumPost.id,
          threadId: forumPost.threadId,
          parentPostId: forumPost.parentPostId,
          content: forumPost.content,
          isDeleted: forumPost.isDeleted,
          isEdited: forumPost.isEdited,
          createdAt: forumPost.createdAt,
          updatedAt: forumPost.updatedAt,
          threadSlug: forumThread.slug,
          threadTitle: forumThread.title,
          categoryName: forumCategory.name,
          authorEmail: userTable.email,
          authorFirstName: userTable.firstName,
          authorLastName: userTable.lastName,
        })
        .from(forumPost)
        .innerJoin(forumThread, eq(forumPost.threadId, forumThread.id))
        .innerJoin(forumCategory, eq(forumThread.categoryId, forumCategory.id))
        .innerJoin(userTable, eq(forumPost.authorId, userTable.id))
        .orderBy(desc(forumPost.updatedAt))
        .limit(postLimit)
        .offset(postOffset),
      []
    ),
    sectionQuery(
      "forum.total-threads",
      db.select({ total: count(forumThread.id) }).from(forumThread),
      []
    ),
    sectionQuery(
      "forum.total-posts",
      db.select({ total: count(forumPost.id) }).from(forumPost),
      []
    ),
    sectionQuery(
      "forum.archived-threads",
      db
        .select({ total: count(forumThread.id) })
        .from(forumThread)
        .where(eq(forumThread.status, "archived")),
      []
    ),
    sectionQuery(
      "forum.locked-threads",
      db
        .select({ total: count(forumThread.id) })
        .from(forumThread)
        .where(eq(forumThread.isLocked, true)),
      []
    ),
    sectionQuery(
      "forum.hidden-posts",
      db
        .select({ total: count(forumPost.id) })
        .from(forumPost)
        .where(eq(forumPost.isDeleted, true)),
      []
    ),
  ]);

  return {
    categories,
    metrics: {
      archivedThreads: Number(archivedThreads[0]?.total ?? 0),
      hiddenPosts: Number(hiddenPosts[0]?.total ?? 0),
      lockedThreads: Number(lockedThreads[0]?.total ?? 0),
      totalPosts: Number(totalPosts[0]?.total ?? 0),
      totalThreads: Number(totalThreads[0]?.total ?? 0),
    },
    posts: {
      items: posts,
      limit: postLimit,
      offset: postOffset,
      page: postPage,
      total: Number(totalPosts[0]?.total ?? 0),
    },
    threads: {
      items: threads,
      limit: threadLimit,
      offset: threadOffset,
      page: threadPage,
      total: Number(totalThreads[0]?.total ?? 0),
    },
  };
}

async function loadSettings(module: string | null) {
  switch (module) {
    case "features":
      return loadFeatureAccessReadModel({ role: "admin" });
    case "pricing":
      return {
        ...(await loadPricingReadModel()),
        adminPlans: await listPricingPlans({
          includeDeleted: true,
          includeInactive: true,
        }),
      };
    case "languages":
      return {
        chat: await listLanguagesWithSettings(),
        translate: await listTranslationFeatureLanguagesWithModels(),
      };
    case "models":
      return loadModelConfigReadModel();
    case "prompts":
      return loadPromptReadModel({ role: "admin" });
    case "translation":
      return loadTranslateReadModel({ includeLanguages: true });
    default:
      return {
        modules: [
          "pricing",
          "features",
          "languages",
          "models",
          "prompts",
          "billing",
          "translation",
          "site",
          "app",
        ],
      };
  }
}

async function loadSection(section: string, request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  switch (section) {
    case "overview":
      return loadOverview();
    case "account":
      return { admin: (await requireAdminUser(request))?.user ?? null };
    case "coupons": {
      const page = parsePositiveInt(
        searchParams.get("page"),
        1,
        Number.MAX_SAFE_INTEGER
      );
      const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE);
      const rows = await sectionQuery("coupons.items", listCouponsWithStats(), []);
      return {
        items: rows.slice((page - 1) * limit, page * limit),
        limit,
        page,
        total: rows.length,
      };
    }
    case "users":
      return loadUsers(searchParams);
    case "chats":
      return loadChats(searchParams);
    case "rag":
      return {
        analytics: await sectionQuery(
          "rag.analytics",
          getRagAnalyticsSummary(),
          null
        ),
        categories: await sectionQuery("rag.categories", listRagCategories(), []),
        entries: await sectionQuery("rag.entries", listAdminRagEntries(50), []),
      };
    case "jobs": {
      const page = parsePositiveInt(
        searchParams.get("page"),
        1,
        Number.MAX_SAFE_INTEGER
      );
      const limit = parsePositiveInt(searchParams.get("limit"), DEFAULT_PAGE_SIZE);
      const offset = (page - 1) * limit;
      const [items, total] = await Promise.all([
        sectionQuery(
          "jobs.items",
          listJobPostingEntries({
            includeInactive: true,
            includeRagState: false,
            limit,
            offset,
          }),
          []
        ),
        sectionQuery("jobs.total", getJobPostingCount({ includeInactive: true }), 0),
      ]);
      return { items, limit, offset, page, total };
    }
    case "forum":
      return loadForum(searchParams);
    case "characters":
      return {
        items: await sectionQuery(
          "characters.items",
          listCharactersForAdmin({ limit: DEFAULT_PAGE_SIZE }),
          []
        ),
      };
    case "contacts":
      return loadContacts(searchParams);
    case "audit-log":
      return loadAuditLog(searchParams);
    case "settings":
      return loadSettings(searchParams.get("module"));
    case "translations": {
      const [languages, entries] = await Promise.all([
        sectionQuery("translations.languages", getAllLanguages(), []),
        sectionQuery("translations.entries", listTranslationEntries(), []),
      ]);
      return { entries, languages };
    }
    default:
      return null;
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const admin = await requireAdminUser(request, { allowBearer: false });
  if (!admin) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const { section } = await context.params;
  const data = await withApiTiming(
    `admin.section.${section}`,
    () => loadSection(section, request),
    {
      metadata: { section },
      slowMs: 1500,
    }
  );

  if (!data) {
    return new ChatSDKError("not_found:api", "Unknown admin section.").toResponse();
  }

  return NextResponse.json(
    {
      data,
      section,
    },
    {
      headers: cacheHeaders(CACHE_CONTROL.privateShort),
    }
  );
}
