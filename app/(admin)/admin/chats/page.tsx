import nextDynamic from "next/dynamic";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { type ChatListItem, getChatCount, listChats } from "@/lib/db/queries";
import { requireAdminPageSession } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";

const AdminChatTables = nextDynamic(() => import("./tables").then((module) => module.AdminChatTables), {
  loading: () => <AdminPageLoading rows={8} titleWidth="w-40" />,
});

export default async function AdminChatsPage() {
  await requireAdminPageSession();
  const [activeChats, deletedChats, activeTotal, deletedTotal] = await Promise.all([
    adminQueryResult({
      fallback: [] as Awaited<ReturnType<typeof listChats>>,
      label: "chats.active",
      promise: listChats({ limit: 10 }),
    }),
    adminQueryResult({
      fallback: [] as Awaited<ReturnType<typeof listChats>>,
      label: "chats.deleted",
      promise: listChats({ limit: 10, onlyDeleted: true }),
    }),
    adminQueryResult({
      fallback: 0,
      label: "chats.active-count",
      promise: getChatCount(),
    }),
    adminQueryResult({
      fallback: 0,
      label: "chats.deleted-count",
      promise: getChatCount({ onlyDeleted: true }),
    }),
  ]);

  return (
    <AdminChatTables
      initialActiveChats={activeChats.data as ChatListItem[]}
      initialActiveConfirmed={activeChats.ok && activeTotal.ok}
      initialActiveTotal={activeTotal.data}
      initialActiveTotalConfirmed={activeTotal.ok}
      initialDeletedChats={deletedChats.data as ChatListItem[]}
      initialDeletedConfirmed={deletedChats.ok && deletedTotal.ok}
      initialDeletedTotal={deletedTotal.data}
      initialDeletedTotalConfirmed={deletedTotal.ok}
      pageSize={10}
    />
  );
}
