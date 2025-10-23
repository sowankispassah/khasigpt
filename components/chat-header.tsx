"use client";

import { useRouter } from "next/navigation";
import { memo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { EllipsisVertical } from "lucide-react";
import { useWindowSize } from "usehooks-ts";

import { SidebarToggle } from "@/components/sidebar-toggle";
import { Button } from "@/components/ui/button";

import { LoaderIcon, PlusIcon } from "./icons";
import { useSidebar } from "./ui/sidebar";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";
import { UserDropdownMenu } from "./user-dropdown-menu";
import { toast } from "./toast";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { data: session, status } = useSession();
  const { setTheme, resolvedTheme } = useTheme();

  const { width: windowWidth } = useWindowSize();

  const user = session?.user;

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleSignOut = () => {
    if (status === "loading") {
      toast({
        type: "error",
        description: "Checking authentication status, please try again!",
      });
      return;
    }

    signOut({ redirectTo: "/login" });
  };

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <SidebarToggle />

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      <div className="order-2 ml-auto flex items-center gap-2 md:order-3">
        {(!open || windowWidth < 768) && (
          <Button
            className="h-8 px-2 md:h-fit md:px-2"
            onClick={() => {
              router.push("/");
              router.refresh();
            }}
            variant="outline"
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        )}

        {status === "loading" ? (
          <Button className="h-8 w-8" disabled variant="outline">
            <LoaderIcon className="animate-spin" size={16} />
            <span className="sr-only">Loading user menu</span>
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
            trigger={
              <Button className="h-8 w-8" size="icon" variant="outline">
                <EllipsisVertical size={18} />
                <span className="sr-only">Open user menu</span>
              </Button>
            }
          />
        ) : null}
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
