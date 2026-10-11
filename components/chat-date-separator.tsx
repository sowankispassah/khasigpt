"use client";

import { formatMessageDateSeparator } from "@/lib/chat/date-separators";
import { EditableTranslation } from "./translation-edit-provider";

export function ChatDateSeparator({ date, now }: { date: Date; now: Date }) {
  const { kind, time, calendarDate } = formatMessageDateSeparator(date, now);
  return (
    <div className="flex w-full justify-center py-2" data-testid="chat-date-separator">
      <time className="text-center text-xs font-normal leading-5 text-muted-foreground" dateTime={date.toISOString()}>
        {kind === "date" ? `${calendarDate}, ${time}` : (
          <EditableTranslation
            defaultText={kind === "today" ? "Today {time}" : "Yesterday {time}"}
            description="Local date and time above the first chat message of the day."
            translationKey={`chat.date_separator.${kind}`}
            values={{ time }}
          />
        )}
      </time>
    </div>
  );
}
