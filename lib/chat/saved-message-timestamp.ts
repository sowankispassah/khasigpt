type SavedTimestamp = { id: string; createdAt: Date };
type ExistingTimestamp = SavedTimestamp & { chatId: string; role: string };

/** INSERT RETURNING is the normal path. Only an idempotent retry needs an
 * indexed lookup; never substitute the retry time for the original date. */
export async function resolveSavedMessageTimestamp({
  inserted,
  messageId,
  chatId,
  role,
  findExisting,
}: {
  inserted: SavedTimestamp[];
  messageId: string;
  chatId: string;
  role: string;
  findExisting: (id: string) => Promise<ExistingTimestamp[]>;
}) {
  const saved = inserted.find((entry) => entry.id === messageId) ??
    (await findExisting(messageId)).find((entry) => entry.chatId === chatId && entry.role === role);
  return saved ? { id: messageId, createdAt: saved.createdAt.toISOString() } : null;
}
