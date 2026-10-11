import { VoiceRelaySocket } from "@/lib/voice/relay-socket";
export function createWebVoiceRelaySocket(endpoint: string) {
  return new VoiceRelaySocket({
    async upload(body) {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Voice transport interrupted");
    },
    async stream(body, onLine, signal) {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      if (!response.ok || !response.body) throw new Error("Voice connection failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        pending += decoder.decode(part.value, { stream: true });
        let newline = pending.indexOf("\n");
        while (newline >= 0) {
          const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
          if (line.trim()) onLine(line);
          newline = pending.indexOf("\n");
        }
      }
    },
  });
}
