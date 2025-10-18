import { cookies } from "next/headers";
import Script from "next/script";
import { AppSidebar } from "@/components/app-sidebar";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { FeatureFlagsProvider } from "@/components/feature-flags-provider";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { loadChatModels } from "@/lib/ai/models";
import { loadFeatureFlags } from "@/lib/feature-flags";
import { getUserBalanceSummary } from "@/lib/db/queries";
import { auth } from "../(auth)/auth";

export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [featureFlags, { models, defaultModel }, session, cookieStore] =
    await Promise.all([loadFeatureFlags(), loadChatModels(), auth(), cookies()]);

  const balance = session?.user
    ? await getUserBalanceSummary(session.user.id)
    : null;

  const sidebarBalance = balance
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
  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <FeatureFlagsProvider value={featureFlags}>
        <ModelConfigProvider
          defaultModelId={defaultModel?.id ?? null}
          models={models}
        >
          <DataStreamProvider>
            <SidebarProvider defaultOpen={!isCollapsed}>
              <AppSidebar user={session?.user} />
              <SidebarInset>{children}</SidebarInset>
            </SidebarProvider>
          </DataStreamProvider>
        </ModelConfigProvider>
      </FeatureFlagsProvider>
    </>
  );
}



