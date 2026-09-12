import { GET as getPricing } from "@/app/api/mobile/pricing/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return getPricing(request);
}
