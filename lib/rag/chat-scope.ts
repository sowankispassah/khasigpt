export const RAG_CHAT_SCOPE_OPTIONS = [
  "default",
  "study",
  "identity",
  "jobs",
  "shared",
] as const;

export type RagChatScope = (typeof RAG_CHAT_SCOPE_OPTIONS)[number];

const DEFAULT_CHAT_SCOPES = new Set<RagChatScope>([
  "default",
  "identity",
  "shared",
]);
const STUDY_CHAT_SCOPES = new Set<RagChatScope>(["study", "shared"]);
const JOBS_CHAT_SCOPES = new Set<RagChatScope>(["jobs", "shared"]);

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

export function isStudyChatRagScope(
  metadata: Record<string, unknown> | null | undefined
) {
  const scope = getRagChatScope(metadata);
  return scope ? STUDY_CHAT_SCOPES.has(scope) : false;
}

export function isJobsChatRagScope(
  metadata: Record<string, unknown> | null | undefined
) {
  const scope = getRagChatScope(metadata);
  return scope ? JOBS_CHAT_SCOPES.has(scope) : false;
}
