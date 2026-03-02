import { ChatLoadingShell } from "@/components/chat-loading-shell";

export default function Loading() {
  // Route-level loading so URL updates instantly on click while the server
  // fetches chat/messages for /chat/[id].
  return <ChatLoadingShell />;
}
