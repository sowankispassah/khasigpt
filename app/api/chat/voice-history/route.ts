import { handleVoiceSessionHistory } from "@/lib/voice/session-history-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleVoiceSessionHistory(request, false); }
