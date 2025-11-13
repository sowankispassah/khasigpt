export type ChatVisibility = "public" | "private";

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; name: string; url: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: ChatMessagePart[];
  createdAt?: string;
};

export type ChatSummary = {
  id: string;
  title: string | null;
  visibility: ChatVisibility;
  createdAt: string;
  lastContext?: unknown;
};
