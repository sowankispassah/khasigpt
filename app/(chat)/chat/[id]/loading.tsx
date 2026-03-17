import { ChatLoadingShellDelayed } from "@/components/chat-loading-shell-delayed";

export default function Loading() {
  // Route-level loading so URL updates instantly on click while the server
  // fetches chat/messages for /chat/[id].
  return <ChatLoadingShellDelayed />;
}
