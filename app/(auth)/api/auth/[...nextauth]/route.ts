import {
  GET as authHandlerGet,
  POST as authHandlerPost,
} from "@/app/(auth)/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = authHandlerGet;
export const POST = authHandlerPost;
