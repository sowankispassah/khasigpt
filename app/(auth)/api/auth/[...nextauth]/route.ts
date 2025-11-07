import NextAuth from "next-auth";

import { authOptions } from "@/app/(auth)/auth";

const authHandler = NextAuth(authOptions);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export { authHandler as GET, authHandler as POST };
