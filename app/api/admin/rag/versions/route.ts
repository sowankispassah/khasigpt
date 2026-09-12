import { type NextRequest, NextResponse } from "next/server";

import { ChatSDKError } from "@/lib/errors";
import { getRagVersions } from "@/lib/rag/service";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
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
