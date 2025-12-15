# 🧠 RAGS.md
### Custom Knowledge (Gemini File Search)

---

## 🔹 Overview
Custom knowledge lets admins add curated content that Gemini can retrieve at answer-time using the **Gemini API File Search tool**.

---

## ⚙️ Core Features
- Fully managed from the Admin Dashboard (`/admin/rag`)
- Model targeting via `models[]` (empty list = applies to all)
- Automatic index sync on create/update/status changes
- Retrieval logging via Gemini `groundingMetadata`

---

## 🔧 Configuration (Environment)
- `GEMINI_FILE_SEARCH_STORE_NAME`: File Search store name (e.g. `fileSearchStores/<store-id>`)
- `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`)

---

## 🧩 Data Model

### Table: `"RagEntry"`
Key fields used by custom knowledge:
- `"title"`, `"content"`, `"tags"[]`, `"sourceUrl"`
- `"status"`: only `active` entries are indexed
- `"approvalStatus"`: only `approved` entries are indexed
- `"models"[]`: model allowlist; empty means all (`*`)
- `"metadata"`: stores Gemini File Search mapping (`metadata.geminiFileSearch.documentName`)
- `"embeddingStatus"`: used as index sync status (`pending` / `ready` / `failed`)

---

## 🔄 Indexing Lifecycle
1. When an entry becomes `active` + `approved`, the server uploads a temporary text file to Gemini and imports it into the File Search store.
2. The resulting `documents/*` name is stored on the entry (`metadata.geminiFileSearch.documentName`).
3. When an entry becomes inactive/unapproved/archived, the corresponding File Search document is deleted.
4. Admin action “Rebuild File Search index” deletes/reimports documents to match the current database state.

Custom metadata attached to each imported document:
- `rag_entry_id` (string)
- `models` (string list, includes `*` when the entry applies to all)

---

## 🔍 Retrieval Logic (Chat)
When the selected model is a Google Gemini model that supports File Search and custom knowledge is enabled:
- The chat API calls Gemini with `tools: [{ file_search: ... }]`
- A `metadata_filter` ensures only documents matching `models:"*"` or the current model are eligible
- Gemini returns citations/retrieval context via `groundingMetadata`, which is recorded as retrieval logs

---

## 🧾 Manual SQL Insert (New Entry)
Use SQL to insert a RAG entry (example):

```sql
INSERT INTO "RagEntry" (
  "title",
  "content",
  "type",
  "status",
  "approvalStatus",
  "tags",
  "models",
  "addedBy"
) VALUES (
  'Terms of Service',
  'Official policy text…',
  'text',
  'active',
  'approved',
  ARRAY['policy','legal'],
  ARRAY[]::text[],
  '<ADMIN_ID>'
);
```

After inserting manually, use the Admin dashboard rebuild action to index it.

---

**End of RAGS.md**
