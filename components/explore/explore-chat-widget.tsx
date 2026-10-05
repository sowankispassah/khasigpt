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
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const sessions = useRef(new Map<string, string>());
  const attempt = useRef(0);
  const handledRequest = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const open = useCallback(async (selected: ExploreResult | null) => {
    const currentAttempt = ++attempt.current;
    setPlace(selected);
    setVisible(true);
    setFailed(false);
    const key = JSON.stringify([location?.latitude, location?.longitude, radiusKm, query, selected?.id ?? null]);
    const existing = sessions.current.get(key);
    if (existing) { setChatId(existing); setPending(false); return; }
    setChatId(null);
    setPending(true);
    const id = generateUUID();
    try {
      const response = await fetch("/api/explore/context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: id, create: true, location, radiusKm, query: query.trim() || "Nearby places",
          selectedResult: selected ? { name: selected.name, address: selected.address, sourceUrl: selected.sourceUrl, description: selected.description, phone: selected.phone, website: selected.website, rating: selected.rating, openStatus: selected.openStatus } : null,
          results: results.slice(0, 24).map((item) => ({ name: item.name, address: item.address, distanceKm: item.distanceKm, sourceUrl: item.sourceUrl })),
        }),
      });
      if (!response.ok) throw new Error("context_unavailable");
      sessions.current.set(key, id);
      if (mounted.current && attempt.current === currentAttempt) setChatId(id);
    } catch {
      if (mounted.current && attempt.current === currentAttempt) setFailed(true);
    } finally {
      if (mounted.current && attempt.current === currentAttempt) setPending(false);
    }
  }, [location, radiusKm, query, results]);

  useEffect(() => {
    if (!request || handledRequest.current === request.id) return;
    handledRequest.current = request.id;
    void open(request.place);
  }, [request, open]);

  return <FloatingChatPopup iconOnly isVisible={visible} onClose={() => setVisible(false)} onOpen={() => void open(null)} title={<div className="min-w-0"><EditableTranslation translationKey="explore.result.ask" defaultText="Ask KhasiGPT" />{place ? <div className="max-w-[20rem] truncate text-muted-foreground text-xs">{place.name}</div> : null}</div>}>
    {pending ? <ChatLoading /> : failed ? <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground text-sm" role="alert"><EditableTranslation translationKey="explore.chat.error" defaultText="Unable to open this chat. Please try again." /><button className="cursor-pointer rounded-full border px-4 py-2" onClick={() => void open(place)} type="button"><EditableTranslation translationKey="common.retry" defaultText="Retry" /></button></div> : chatId ? <ChatPanel key={chatId} chatId={chatId} defaultOpen={visible} embedded restoreHistory documentUploadsEnabled={false} initialChatLanguage={activeLanguage.code} initialChatModel="default" /> : null}
  </FloatingChatPopup>;
}
