import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragEntry, ragSearchLog, user } from "@/lib/db/schema";
import { retrieveRagContext } from "@/lib/rag/retrieval";
import { createRagEntry } from "@/lib/rag/service";
import type { RagRetrievalResult } from "@/lib/rag/types";

const allowWrite = process.env.RAG_SMOKE_ALLOW_WRITE === "1";
if (!allowWrite) {
  throw new Error("Set RAG_SMOKE_ALLOW_WRITE=1 to run the temporary RAG smoke test.");
}

const queries = {
  exact: "What is the official colour of the Lynti-A7 beacon?",
  paraphrase: "Which shade identifies beacon Lynti-A7?",
  khasi: "Kaei ka rong jong ka Lynti-A7 beacon?",
  unrelated: "Explain photosynthesis in desert cacti.",
};

async function main() {
const actorRows = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.role, "admin"))
  .limit(1);
const actorId = actorRows[0]?.id;
if (!actorId) {
  throw new Error("No admin user is available for the RAG smoke test.");
}

let entryId: string | null = null;
try {
  const entry = await createRagEntry({
    actorId,
    input: {
      title: "Lynti-A7 beacon official colour",
      content:
        "The official colour of the Lynti-A7 beacon is ultramarine blue. Ha Khasi: Ka rong ba pura jong ka Lynti-A7 beacon ka dei ka ultramarine blue.",
      type: "text",
      status: "active",
      approvalStatus: "approved",
      tags: ["rag-smoke", "lynti-a7"],
      models: [],
      metadata: { chatScope: "default", smokeTest: true },
    },
  });
  entryId = entry.id;
  if (entry.embeddingStatus !== "ready") {
    throw new Error(`Smoke entry indexing failed: ${entry.embeddingError}`);
  }

  const resultEntries = await Promise.all(
    Object.entries(queries).map(async ([name, query]) => [
      name,
      await retrieveRagContext({
        query,
        scope: "default",
        userId: actorId,
        modelKey: "rag-smoke",
      }),
    ]),
  );
  const results = Object.fromEntries(resultEntries) as Record<
    keyof typeof queries,
    RagRetrievalResult
  >;

  for (const name of ["exact", "paraphrase", "khasi"] as const) {
    if (!results[name]?.matches.some((match) => match.entryId === entry.id)) {
      throw new Error(`${name} query did not retrieve the smoke entry.`);
    }
  }
  if (results.unrelated?.matches.some((match) => match.entryId === entry.id)) {
    throw new Error("Unrelated query incorrectly retrieved the smoke entry.");
  }

  console.info("[rag-smoke] passed", {
    entryId: entry.id,
    results: Object.fromEntries(
      Object.entries(results).map(([name, result]) => [
        name,
        {
          status: result?.status,
          language: result?.language,
          scores: result?.matches.map((match) => match.score),
        },
      ]),
    ),
  });
} finally {
  const queryHashes = Object.values(queries).map((query) =>
    createHash("sha256").update(query).digest("hex"),
  );
  await db.delete(ragSearchLog).where(inArray(ragSearchLog.queryHash, queryHashes));
  if (entryId) {
    await db.delete(ragEntry).where(eq(ragEntry.id, entryId));
  }
}
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[rag-smoke] failed", error);
    process.exit(1);
  });
