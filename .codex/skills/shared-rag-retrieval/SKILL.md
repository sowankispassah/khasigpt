---
name: shared-rag-retrieval
description: Preserve KhasiGPT's shared multilingual RAG architecture when adding, changing, debugging, or reviewing custom knowledge, embeddings, chunking, retrieval ranking, admin RAG UI, text chat grounding, native chat grounding, live voice knowledge tools, or RAG logging and migrations.
---

# Shared RAG Retrieval

## Overview

Keep every chat surface on one retrieval implementation: Google multilingual
embeddings, PostgreSQL hybrid vector/keyword search, scoped filtering, and
explicit context injection. Prefer meaningful fields and trace retrieval
failures at their source.

## Architecture Invariants

- Treat `lib/rag/retrieval.ts` as the shared runtime entry point.
- Store chunk embeddings in `RagChunk`; do not introduce a second vector store
  or provider-specific document index.
- Use the same retriever for web chat, native text chat, and the authenticated
  live-voice knowledge tool.
- Keep `Knowledge scope` meaningful. `default`, `study`, `jobs`, and deliberately
  shared entries must not leak into one another.
- Keep model restrictions optional and advanced. Empty means all models.
- Keep categories out of retrieval and the common create form. Tags are
  optional retrieval hints, not required taxonomy.
- New admin entries default to active and become retrievable after successful
  indexing.
- Detect and retrieve Khasi/Pnar/English queries without English-only keyword
  gates.
- Use semantic and keyword candidates together. Preserve relevance thresholds,
  per-entry diversity, bounded context, and deterministic ranking tests.
- Never silently switch retrieval providers. On failure, log it and let the
  normal model continue without custom context.

## Change Workflow

1. Map admin input, schema/migration, indexing, retrieval, prompt injection,
   web/native/voice consumers, logs, and tests before editing.
2. Decide whether each proposed field improves retrieval or only presentation.
   Remove redundant fields and migrate useful legacy values into tags or
   metadata.
3. Keep chunking deterministic and bounded. Re-index on content, title, tags,
   language, scope, approval, activation, model restriction, or deletion
   changes.
4. Filter authorization, personal ownership, status, approval, scope, and model
   restrictions in SQL before ranking.
5. Hash production query text. Store raw queries only outside production.
   Development logs may include language, candidates, scores, chosen chunks,
   context previews, timing, and fallback reason.
6. Keep retrieval non-fatal to chat, but never swallow indexing state or
   retrieval failures without a structured log.
7. Add a real Drizzle migration for schema changes and run the repository's
   migration workflow.

## Required Verification

- Exact-title or exact-keyword question retrieves the intended entry.
- English paraphrase retrieves the intended entry.
- Khasi question retrieves the intended Khasi or cross-lingual entry.
- Unrelated question does not attach low-relevance context.
- Scope, personal-user, status, approval, and model restrictions filter
  correctly.
- Long content chunks are bounded, overlapping, and reproducible.
- Create, edit, activate, archive, restore, approve, and rebuild leave index
  state correct.
- Web chat, native text chat, and live voice all use the same saved fact.
- Production logs contain hashes, IDs, counts, and timing but no raw query.
- Run targeted tests, `pnpm lint`, `pnpm typecheck`, and a production build for
  routing, schema, or rendering changes.

## Avoid

- Do not restore English trigger-word gates.
- Do not fetch all active entries and filter them in application memory.
- Do not log raw production queries, retrieved private content, secrets, or
  provider payloads.
- Do not solve stuck indexing by increasing timeouts. Use cancellable requests,
  explicit status, bounded concurrency, and retryable operations.
- Do not make live voice maintain a separate knowledge corpus.
