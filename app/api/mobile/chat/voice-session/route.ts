import { handleDurationSession } from "@/lib/voice/duration-session-route";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export function POST(request: Request) { return handleDurationSession(request, "native"); }
