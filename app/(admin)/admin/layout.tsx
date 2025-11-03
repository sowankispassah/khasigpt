import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">Admin Console</h1>
            <p className="text-muted-foreground text-sm">
              Manage users, models, and infrastructure activity
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm font-medium">
            <Link className="hover:underline" href="/admin">
              Overview
            </Link>
            <Link className="hover:underline" href="/admin/account">
              Account
            </Link>
            <Link className="hover:underline" href="/admin/users">
              Users
            </Link>
            <Link className="hover:underline" href="/admin/chats">
              Chats
            </Link>
            <Link className="hover:underline" href="/admin/contacts">
              Contacts
            </Link>
            <Link className="hover:underline" href="/admin/logs">
              Audit Log
            </Link>
            <Link className="hover:underline" href="/admin/settings">
              Settings
            </Link>
            <Link className="hover:underline" href="/admin/translations">
              Translations
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
