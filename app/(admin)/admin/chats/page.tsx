import nextDynamic from "next/dynamic";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { adminQueryOr } from "@/lib/admin/safe-query";
import { type ChatListItem, getChatCount, listChats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const AdminChatTables = nextDynamic(() => import("./tables").then((module) => module.AdminChatTables), {
  loading: () => <AdminPageLoading rows={8} titleWidth="w-40" />,
});

export default async function AdminChatsPage() {
  const [activeChats, deletedChats, activeTotal, deletedTotal] = await Promise.all([
    adminQueryOr({
      fallback: [] as Awaited<ReturnType<typeof listChats>>,
      label: "chats.active",
      promise: listChats({ limit: 10 }),
    }),
    adminQueryOr({
      fallback: [] as Awaited<ReturnType<typeof listChats>>,
      label: "chats.deleted",
      promise: listChats({ limit: 10, onlyDeleted: true }),
    }),
    adminQueryOr({
      fallback: 0,
      label: "chats.active-count",
      promise: getChatCount(),
    }),
    adminQueryOr({
      fallback: 0,
      label: "chats.deleted-count",
      promise: getChatCount({ onlyDeleted: true }),
    }),
  ]);

  return (
    <AdminChatTables
      initialActiveTotal={activeTotal}
      initialActiveChats={activeChats as ChatListItem[]}
      initialDeletedTotal={deletedTotal}
      initialDeletedChats={deletedChats as ChatListItem[]}
      pageSize={10}
    />
  );
}
