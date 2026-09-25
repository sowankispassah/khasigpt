export function buildPendingChatHref({
  href,
  pendingChatId,
}: {
  href: string;
  pendingChatId: string;
}) {
  const [pathname, queryString = ""] = href.split("?", 2);
  const params = new URLSearchParams(queryString);
  params.set("pendingChatId", pendingChatId.trim());
  return `${pathname}?${params.toString()}`;
}
