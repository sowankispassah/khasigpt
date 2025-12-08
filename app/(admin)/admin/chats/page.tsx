import { type ChatListItem, listChats } from "@/lib/db/queries";
import { AdminChatTables } from "./tables";

export const dynamic = "force-dynamic";

export default async function AdminChatsPage() {
  const [activeChats, deletedChats] = await Promise.all([
    listChats({ limit: 10 }),
    listChats({ limit: 10, onlyDeleted: true }),
  ]);

  return (
    <AdminChatTables
      initialActiveChats={activeChats as ChatListItem[]}
      initialDeletedChats={deletedChats as ChatListItem[]}
      pageSize={10}
    />
  );
}
