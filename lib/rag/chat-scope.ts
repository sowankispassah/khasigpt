export const RAG_CHAT_SCOPE_OPTIONS = [
  "default",
  "jobs",
  "study",
  "shared",
] as const;

export type RagChatScope = (typeof RAG_CHAT_SCOPE_OPTIONS)[number];

const DEFAULT_CHAT_SCOPES = new Set<RagChatScope>(["default", "shared"]);

export function normalizeRagChatScope(value: unknown): RagChatScope | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return RAG_CHAT_SCOPE_OPTIONS.includes(normalized as RagChatScope)
    ? (normalized as RagChatScope)
    : null;
}

export function getRagChatScope(
  metadata: Record<string, unknown> | null | undefined
): RagChatScope | null {
  if (!metadata) {
    return null;
  }

  return normalizeRagChatScope(metadata.chatScope);
}

export function isDefaultChatRagScope(
  metadata: Record<string, unknown> | null | undefined
) {
  const scope = getRagChatScope(metadata);
  return scope ? DEFAULT_CHAT_SCOPES.has(scope) : false;
}
