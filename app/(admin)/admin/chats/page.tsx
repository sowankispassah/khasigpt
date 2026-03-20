import nextDynamic from "next/dynamic";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { type ChatListItem, getChatCount, listChats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const AdminChatTables = nextDynamic(() => import("./tables").then((module) => module.AdminChatTables), {
  loading: () => <AdminPageLoading rows={8} titleWidth="w-40" />,
});

export default async function AdminChatsPage() {
  const [activeChats, deletedChats, activeTotal, deletedTotal] = await Promise.all([
    listChats({ limit: 10 }),
    listChats({ limit: 10, onlyDeleted: true }),
    getChatCount(),
    getChatCount({ onlyDeleted: true }),
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
