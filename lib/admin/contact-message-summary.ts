const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(lines: string[], label: string) {
  const prefix = `${label}: `;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line?.slice(prefix.length).trim() || null;
}

export function summarizeContactMessage(message: string) {
  const lines = (typeof message === "string" ? message : "").split(/\r?\n/);
  const category = field(lines, "Feedback category");
  const chatIdValue = field(lines, "Chat ID");
  const messageIdValue = field(lines, "Message ID");
  const chatId = chatIdValue && UUID_PATTERN.test(chatIdValue) ? chatIdValue : null;
  const messageId = messageIdValue && UUID_PATTERN.test(messageIdValue) ? messageIdValue : null;
  const detailsIndex = lines.findIndex((line) => line.startsWith("User details: "));
  const chatIndex = lines.findIndex((line) => line.startsWith("Chat ID: "));
  const excerptIndex = lines.findIndex((line) => line.startsWith("Response excerpt: "));
  const details = detailsIndex < 0
    ? null
    : lines
        .slice(detailsIndex, chatIndex > detailsIndex ? chatIndex : detailsIndex + 1)
        .join("\n")
        .replace(/^User details: /, "")
        .trim();
  const excerpt = excerptIndex < 0
    ? null
    : lines.slice(excerptIndex).join("\n").replace(/^Response excerpt: /, "").trim();

  return {
    category,
    chatId,
    messageId,
    details: details && details !== "[None provided]" ? details : null,
    excerpt,
    isAiFeedback: Boolean(category || (chatId && messageId && excerpt)),
  };
}
