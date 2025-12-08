import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { FeatureFlagsProvider } from "@/components/feature-flags-provider";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { loadChatModels } from "@/lib/ai/models";
import { getUserBalanceSummary, getUserById } from "@/lib/db/queries";
import { loadFeatureFlags } from "@/lib/feature-flags";
import { auth } from "../(auth)/auth";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [featureFlags, { models, defaultModel }, session, cookieStore] =
    await Promise.all([
      loadFeatureFlags(),
      loadChatModels(),
      auth(),
      cookies(),
    ]);

  const dbUser = session?.user ? await getUserById(session.user.id) : null;
  const profileUser = dbUser ?? session?.user ?? null;

  if (
    profileUser &&
    (!profileUser.dateOfBirth ||
      !profileUser.firstName ||
      !profileUser.lastName)
  ) {
    redirect("/complete-profile");
  }

  const balance = profileUser
    ? await getUserBalanceSummary(profileUser.id)
    : null;

  const _sidebarBalance = balance
    ? {
        tokensRemaining: balance.tokensRemaining,
        tokensTotal: balance.tokensTotal,
        creditsRemaining: balance.creditsRemaining,
        creditsTotal: balance.creditsTotal,
        expiresAt: balance.expiresAt?.toISOString() ?? null,
        startedAt: balance.startedAt?.toISOString() ?? null,
        plan: balance.plan
          ? {
              id: balance.plan.id,
              name: balance.plan.name,
              priceInPaise: balance.plan.priceInPaise,
              billingCycleDays: balance.plan.billingCycleDays,
            }
          : null,
      }
    : null;
  const sidebarState = cookieStore.get("sidebar_state")?.value;
  const defaultSidebarOpen = sidebarState !== "false";

  return (
    <FeatureFlagsProvider value={featureFlags}>
      <ModelConfigProvider
        defaultModelId={defaultModel?.id ?? null}
        models={models}
      >
        <DataStreamProvider>
          <SidebarProvider defaultOpen={defaultSidebarOpen}>
            <AppSidebar user={session?.user} />
            <SidebarInset>{children}</SidebarInset>
          </SidebarProvider>
        </DataStreamProvider>
      </ModelConfigProvider>
    </FeatureFlagsProvider>
  );
}
