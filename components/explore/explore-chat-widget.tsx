"use client";

import { LoaderCircle } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { FloatingChatPopup } from "@/components/jobs/floating-chat-popup";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { ExploreLocationInput, ExploreResult } from "@/lib/explore/types";
import { generateUUID } from "@/lib/utils";

const ChatPanel = dynamic(() => import("@/components/jobs/job-details-chat-panel").then((module) => module.JobDetailsChatPanel), {
  ssr: false,
  loading: () => <ChatLoading />,
});

function ChatLoading() {
  return <div className="flex flex-1 items-center justify-center gap-2 p-6 text-muted-foreground text-sm" aria-live="polite"><LoaderCircle className="size-4 animate-spin" /><EditableTranslation translationKey="chat.popup.loading" defaultText="Loading chat..." /></div>;
}

type Props = {
  request: { id: string; place: ExploreResult } | null;
  location: ExploreLocationInput | null;
  radiusKm: number;
  query: string;
  results: ExploreResult[];
};

export function ExploreChatWidget({ request, location, radiusKm, query, results }: Props) {
  const { activeLanguage } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [place, setPlace] = useState<ExploreResult | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [restoreHistory, setRestoreHistory] = useState(false);
  const sessions = useRef(new Map<string, string>());
  const saved = useRef(new Set<string>());
  const handledRequest = useRef<string | null>(null);

  const open = useCallback((selected: ExploreResult | null) => {
    setPlace(selected);
    setVisible(true);
    const key = JSON.stringify([location?.latitude, location?.longitude, radiusKm, query, selected?.id ?? null]);
    let id = sessions.current.get(key);
    if (!id) { id = generateUUID(); sessions.current.set(key, id); }
    setChatId(id);
    setRestoreHistory(saved.current.has(id));
  }, [location, radiusKm, query]);

  const prepareBeforeSend = useCallback(async () => {
    if (!chatId || saved.current.has(chatId)) return;
    const response = await fetch("/api/explore/context", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId, create: true, location, radiusKm, query: query.trim() || "Nearby places",
        selectedResult: place ? { name: place.name, address: place.address, sourceUrl: place.sourceUrl, description: place.description, phone: place.phone, website: place.website, rating: place.rating, openStatus: place.openStatus } : null,
        results: results.slice(0, 24).map((item) => ({ name: item.name, address: item.address, distanceKm: item.distanceKm, sourceUrl: item.sourceUrl })),
      }),
    });
    if (!response.ok) throw new Error("context_unavailable");
    saved.current.add(chatId);
  }, [chatId, location, radiusKm, query, place, results]);

  useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    handledRequest.current = request.id;
    void open(request.place);
  }, [request, open]);

  return <FloatingChatPopup iconOnly isVisible={visible} onClose={() => setVisible(false)} onOpen={() => void open(null)} title={<div className="min-w-0"><EditableTranslation translationKey="explore.result.ask" defaultText="Ask KhasiGPT" />{place ? <div className="max-w-[20rem] truncate text-muted-foreground text-xs">{place.name}</div> : null}</div>}>
    {chatId ? <ChatPanel key={chatId} chatId={chatId} defaultOpen={visible} embedded restoreHistory={restoreHistory} onBeforeSubmit={prepareBeforeSend} documentUploadsEnabled={false} initialChatLanguage={activeLanguage.code} initialChatModel="default" /> : null}
  </FloatingChatPopup>;
}
