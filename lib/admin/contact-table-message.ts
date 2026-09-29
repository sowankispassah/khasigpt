import { formatDistanceToNow } from "date-fns";
import type { ContactTableMessage } from "@/components/admin/contact-messages-table";
import type { ContactMessage } from "@/lib/db/schema";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function toContactTableMessage(message: ContactMessage): ContactTableMessage {
  const createdAt = new Date(message.createdAt ?? Number.NaN);
  const updatedAt = new Date(message.updatedAt ?? Number.NaN);
  const validCreatedAt = Number.isFinite(createdAt.getTime());
  return {
    ...message,
    message: typeof message.message === "string" ? message.message : "",
    createdAt: validCreatedAt ? createdAt.toISOString() : "",
    receivedAt: validCreatedAt ? `${dateFormatter.format(createdAt)} IST` : "—",
    receivedRelative: validCreatedAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : "—",
    updatedAt: Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString() : "",
    updatedAtLabel: Number.isFinite(updatedAt.getTime()) ? `${dateFormatter.format(updatedAt)} IST` : "—",
    lastInboundAt: message.lastInboundAt ? new Date(message.lastInboundAt).toISOString() : null,
  };
}
