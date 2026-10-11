import { handleVoiceRelay } from "@/lib/voice/relay-route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) { return handleVoiceRelay(request, "web"); }
