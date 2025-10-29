"use client";

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
        <Button
          className="h-8 px-3"
          onClick={() => router.push("/login")}
          variant="outline"
        >
          Sign in
        </Button>
      )}
    </div>
  );
}
