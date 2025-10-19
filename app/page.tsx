import Script from "next/script";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { AppSidebar } from "@/components/app-sidebar";
import { FeatureFlagsProvider } from "@/components/feature-flags-provider";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { loadChatModels } from "@/lib/ai/models";
import { loadFeatureFlags } from "@/lib/feature-flags";
import { generateUUID } from "@/lib/utils";
import { auth } from "./(auth)/auth";

export default async function RootPage() {
  const [featureFlags, { models, defaultModel }, session, cookieStore] =
    await Promise.all([loadFeatureFlags(), loadChatModels(), auth(), cookies()]);

  if (!session) {
    redirect("/login");
  }

  const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

  const id = generateUUID();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const fallbackModelId =
    modelIdFromCookie?.value ??
    defaultModel?.id ??
    models[0]?.id ??
    "";

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
              <AppSidebar user={session.user} />
              <SidebarInset>
                <Chat
                  autoResume={false}
                  id={id}
                  initialChatModel={fallbackModelId}
                  initialMessages={[]}
                  initialVisibilityType="private"
                  isReadonly={false}
                  key={id}
                />
                <DataStreamHandler />
              </SidebarInset>
            </SidebarProvider>
          </DataStreamProvider>
        </ModelConfigProvider>
      </FeatureFlagsProvider>
    </>
  );
}

