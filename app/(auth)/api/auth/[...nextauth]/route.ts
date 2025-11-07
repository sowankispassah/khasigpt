import { GET as authGet, POST as authPost } from "@/app/(auth)/auth";

export const GET = authGet;
export const POST = authPost;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
