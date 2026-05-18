"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ReactNode } from "react";

import type { ChatMessage } from "@/lib/types";
import type { ArtifactKind } from "./artifact";

export type ArtifactToolbarItem = {
  description: string;
  icon: ReactNode;
  onClick: ({
    sendMessage,
  }: {
    sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  }) => void;
};

type ToolbarProps = {
  artifactKind: ArtifactKind;
  isToolbarVisible: boolean;
  setIsToolbarVisible: (isVisible: boolean) => void;
  status: UseChatHelpers<ChatMessage>["status"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
};

export const Tools = (_props: { tools: ArtifactToolbarItem[] }) => null;

export function Toolbar(_props: ToolbarProps) {
  return null;
}
