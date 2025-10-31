"use client";

import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/icons";
import { UserDropdownMenu, UserMenuTrigger } from "@/components/user-dropdown-menu";
import { cn } from "@/lib/utils";

export function PageUserMenu({ className }: { className?: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  const user = session?.user ?? null;

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleSignOut = () => {
    signOut({ redirectTo: "/login" });
  };

  return (
    <div
      className={cn(
        "fixed right-4 top-2 z-40 flex items-center gap-2",
        className
      )}
    >
      {status === "loading" ? (
        <Button className="h-8 w-8" disabled variant="outline">
          <span className="sr-only">Loading user menu</span>
          <span className="animate-spin">
            <LoaderIcon size={16} />
          </span>
        </Button>
      ) : user ? (
        <UserDropdownMenu
          align="end"
          isAdmin={user.role === "admin"}
          isAuthenticated
          onNavigate={handleNavigate}
          onSignOut={handleSignOut}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          userEmail={user.email ?? undefined}
          trigger={
            <UserMenuTrigger
              user={{
                name: user.name,
                email: user.email,
                imageVersion: user.imageVersion ?? null,
              }}
            />
          }
        />
      ) : (
        <UserDropdownMenu
          align="end"
          isAdmin={false}
          isAuthenticated={false}
          onNavigate={handleNavigate}
          onToggleTheme={handleToggleTheme}
          resolvedTheme={resolvedTheme}
          side="bottom"
          trigger={
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              type="button"
            >
              <EllipsisVertical size={16} />
              <span className="sr-only">Open menu</span>
            </button>
          }
        />
      )}
    </div>
  );
}
