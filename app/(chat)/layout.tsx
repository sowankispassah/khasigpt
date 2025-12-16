import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPreloader } from "@/components/chat-preloader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    return <>{children}</>;
  }

  const cookieStore = await cookies();

  const profileUser = session.user ?? null;

  if (
    profileUser &&
    (!profileUser.dateOfBirth ||
      !profileUser.firstName ||
      !profileUser.lastName)
  ) {
    redirect("/complete-profile");
  }

  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <ChatPreloader />
      <AppSidebar user={session.user} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
