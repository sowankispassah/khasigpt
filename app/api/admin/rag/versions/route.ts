import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { getRagVersions } from "@/lib/rag/service";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.role !== "admin") {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const entryId = new URL(request.url).searchParams.get("entryId");

  if (!entryId) {
    return new ChatSDKError("bad_request:api", "Missing entryId").toResponse();
  }

  const versions = await getRagVersions(entryId);
  const serialized = versions.map((version) => ({
    id: version.id,
    version: version.version,
    title: version.title,
    status: version.status,
    createdAt: new Date(version.createdAt).toISOString(),
    editorName: version.editorName,
    changeSummary: version.changeSummary,
  }));

  return NextResponse.json(serialized);
}
