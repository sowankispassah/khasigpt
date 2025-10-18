import Link from "next/link";
import {
  deleteChatAction,
  hardDeleteChatAction,
  restoreChatAction,
} from "@/app/(admin)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listChats } from "@/lib/db/queries";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminChatsPage() {
  const [activeChats, deletedChats] = await Promise.all([
    listChats({ limit: 100 }),
    listChats({ limit: 100, onlyDeleted: true }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6">
        <header>
          <h2 className="text-xl font-semibold">Chat sessions</h2>
          <p className="text-muted-foreground text-sm">
            Review and remove chat threads across the application.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Chat</th>
                <th className="py-3 text-left">Owner</th>
                <th className="py-3 text-left">Visibility</th>
                <th className="py-3 text-left">Created</th>
                <th className="py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeChats.map((chat) => (
                <tr key={chat.id} className="border-t text-sm">
                  <td className="py-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        className="text-sm font-medium text-primary hover:underline"
                        href={`/chat/${chat.id}?admin=1`}
                      >
                        {chat.title || "Untitled chat"}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 capitalize">{chat.visibility}</td>
                  <td className="py-3 text-muted-foreground text-xs">
                    {new Date(chat.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3">
                    <form
                      action={async () => {
                        "use server";
                        await deleteChatAction({ chatId: chat.id });
                      }}
                    >
                      <Button size="sm" type="submit" variant="secondary">
                        Soft delete
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
              {activeChats.length === 0 && (
                <tr>
                  <td className="py-6 text-muted-foreground" colSpan={5}>
                    No chat sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <header>
          <h3 className="text-lg font-semibold">Deleted chats</h3>
          <p className="text-muted-foreground text-sm">
            Soft-deleted chats remain hidden from users. Permanently delete them
            here if they are no longer needed.
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Chat</th>
                <th className="py-3 text-left">Owner</th>
                <th className="py-3 text-left">Visibility</th>
                <th className="py-3 text-left">Deleted</th>
                <th className="py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deletedChats.map((chat) => (
                <tr key={chat.id} className="border-t text-sm">
                  <td className="py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="text-sm font-medium text-primary hover:underline"
                          href={`/chat/${chat.id}?admin=1`}
                        >
                          {chat.title || "Untitled chat"}
                        </Link>
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          Deleted
                        </Badge>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 capitalize">{chat.visibility}</td>
                  <td className="py-3 text-muted-foreground text-xs">
                    {chat.deletedAt
                      ? formatDistanceToNow(new Date(chat.deletedAt), {
                          addSuffix: true,
                        })
                      : "—"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <form
                        action={async () => {
                          "use server";
                          await restoreChatAction({ chatId: chat.id });
                        }}
                      >
                        <Button size="sm" type="submit" variant="secondary">
                          Restore
                        </Button>
                      </form>
                      <form
                        action={async () => {
                          "use server";
                          await hardDeleteChatAction({ chatId: chat.id });
                        }}
                      >
                        <Button size="sm" type="submit" variant="destructive">
                          Permanent delete
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {deletedChats.length === 0 && (
                <tr>
                  <td className="py-6 text-muted-foreground" colSpan={5}>
                    No deleted chats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
