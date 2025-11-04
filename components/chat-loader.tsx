"use client";

import dynamic from "next/dynamic";
import type { ChatMessage } from "@/lib/types";
import type { VisibilityType } from "./visibility-selector";

const ChatSkeleton = () => (
  <div className="flex h-dvh flex-col gap-4 px-3 py-6 md:px-6">
    <div className="mx-auto flex w-full max-w-4xl flex-1 animate-pulse flex-col gap-4">
      <div className="h-9 w-32 rounded-full bg-muted" />
      <div className="h-48 rounded-2xl bg-muted" />
      <div className="h-6 w-full rounded-full bg-muted/80" />
      <div className="mt-auto flex flex-col gap-2">
        <div className="h-9 rounded-2xl bg-muted" />
        <div className="h-16 rounded-xl border border-dashed border-muted-foreground/40" />
      </div>
    </div>
  </div>
);

type ChatProps = {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  suggestedPrompts: string[];
};

const ChatClient = dynamic<ChatProps>(
  () => import("./chat").then((module) => module.Chat),
  {
    ssr: false,
    loading: () => <ChatSkeleton />,
  }
);

export function ChatLoader(props: ChatProps) {
  return <ChatClient {...props} />;
}
