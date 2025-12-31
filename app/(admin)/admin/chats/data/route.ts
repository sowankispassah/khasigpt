import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { listChats } from "@/lib/db/queries";

export async function GET(request: Request) {
  const session = await auth();

  if (!session || session.user?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Number.parseInt(searchParams.get("limit") ?? "10", 10);
  const deleted = searchParams.get("deleted") === "1";

  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const safeLimit =
    Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 10;

  const chats = await listChats({
    limit: safeLimit,
    offset: safeOffset,
    onlyDeleted: deleted,
  });

  return NextResponse.json({ items: chats });
}
