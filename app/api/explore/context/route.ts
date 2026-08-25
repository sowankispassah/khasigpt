import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { getChatById, saveMessages } from "@/lib/db/queries";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { exploreLocationSchema } from "@/lib/explore/validation";
import { generateUUID } from "@/lib/utils";

const schema = z.object({
  chatId: z.string().uuid(),
  location: exploreLocationSchema,
  radiusKm: z.number().int().min(1).max(50),
  query: z.string().trim().min(1).max(500),
  category: z.string().trim().max(160).nullable().optional(),
  subcategory: z.string().trim().max(160).nullable().optional(),
  selectedResult: z.object({
    name: z.string().trim().min(1).max(240),
    address: z.string().trim().max(500).nullable().optional(),
    sourceUrl: z.string().url(),
  }),
  results: z.array(z.object({
    name: z.string().trim().min(1).max(240),
    address: z.string().trim().max(500).nullable().optional(),
    distanceKm: z.number().finite().min(0).max(100),
    sourceUrl: z.string().url(),
  })).max(12),
});

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isExploreMeghalayaEnabledForRole(auth.user.role))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const chat = await getChatById({ id: parsed.data.chatId });
  if (!chat || chat.userId !== auth.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await saveMessages({ messages: [{
    chatId: chat.id,
    id: generateUUID(),
    role: "assistant",
    parts: [{
      type: "text",
      text: [
        `Current Explore location: ${parsed.data.location.label} (${parsed.data.location.latitude}, ${parsed.data.location.longitude}).`,
        `Current radius: ${parsed.data.radiusKm} km.`,
        `Current search: ${parsed.data.query}${parsed.data.category ? `; category: ${parsed.data.category}` : ""}${parsed.data.subcategory ? `; subcategory: ${parsed.data.subcategory}` : ""}.`,
        `Selected result: ${parsed.data.selectedResult.name}${parsed.data.selectedResult.address ? ` — ${parsed.data.selectedResult.address}` : ""}. Source: ${parsed.data.selectedResult.sourceUrl}.`,
        "Current geographically verified result set:",
        ...parsed.data.results.map((result) => `- ${result.name} (${result.distanceKm.toFixed(1)} km)${result.address ? ` — ${result.address}` : ""}: ${result.sourceUrl}`),
        "Treat follow-up questions as referring only to this current location, radius, selected result, and result set unless the user explicitly asks for a new Explore search.",
      ].join("\n"),
    }],
    attachments: [],
    createdAt: new Date(),
  }] });
  return NextResponse.json({ ok: true });
}
