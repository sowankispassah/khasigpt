import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getChatCount, listChats } from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

const ADMIN_CHATS_DATA_TIMEOUT_MS = 5000;

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

  try {
    const [chats, total] = await withTimeout(
      Promise.all([
        listChats({
          limit: safeLimit,
          offset: safeOffset,
          onlyDeleted: deleted,
        }),
        getChatCount({
          onlyDeleted: deleted,
        }),
      ]),
      ADMIN_CHATS_DATA_TIMEOUT_MS,
      () => {
        console.error("[admin/chats/data] Chat table read timed out.", {
          deleted,
          limit: safeLimit,
          offset: safeOffset,
          timeoutMs: ADMIN_CHATS_DATA_TIMEOUT_MS,
        });
      }
    );

    return NextResponse.json(
      { items: chats, total },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error("[admin/chats/data] Failed to load chat rows.", error);
    return NextResponse.json(
      {
        error: "chats_unavailable",
        message: "Chat rows are unavailable. Retry this section.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
}
