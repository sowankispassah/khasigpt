# 🧠 RAGS.md  
### Retrieval-Augmented Generation System Specification  
*(Powered by Supabase Vector)*  

---

## 🔹 Overview
The RAG (Retrieval-Augmented Generation) system enables the app to inject **custom, admin-defined knowledge** into AI responses.  
It supports **multi-modal content**, **multi-model control**, and **real-time semantic retrieval** via **Supabase Vector**.

---

## ⚙️ Core Features

- Fully managed from the **Admin Dashboard**
- Supports **Text**, **Documents**, **Images**, **Audio**, **Links**, and **Data Files**
- Each RAG entry is:
  - Editable / Deletable
  - Activatable / Deactivatable
  - Assignable to one or multiple AI models
- Integrated with **Supabase Vector** for embedding storage and retrieval
- Tracks metadata such as creator, timestamps, and retrieval statistics

---

## 🧩 Database Schema

### **Table: `rag_entries`**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | TEXT | Descriptive name of the RAG entry |
| content | TEXT | Main text or extracted summary |
| type | ENUM('text','document','image','audio','video','link','data') | RAG content type |
| tags | TEXT[] | Keywords for classification |
| source_url | TEXT | Optional file or reference link |
| embedding | VECTOR | Semantic vector stored in Supabase Vector |
| status | ENUM('active','inactive','archived') | Availability |
| models | TEXT[] | List of models this RAG applies to (e.g. `["gpt-5","gemini-pro"]`) |
| category_id | UUID | Optional category (News, Study, FAQ, etc.) |
| added_by | UUID | Admin ID who created or modified it |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |
| version | INTEGER | Revision number |

---

## 🔄 RAG Lifecycle

1. **Creation**
   - Admin adds a new entry with title, content, type, and model assignment.  
   - System automatically generates an embedding and stores it in Supabase Vector.

2. **Editing**
   - Admins can modify content, tags, or model associations.
   - Each update creates a **new version** with timestamp and editor log.

3. **Activation**
   - Only entries marked `active` participate in retrieval.
   - Deactivated or archived RAGs remain stored but excluded from searches.

4. **Deletion**
   - Deletions are **soft** (recoverable) for audit and rollback.

---

## 🔍 Retrieval Logic

1. User sends a query → detect the **active model** (e.g. GPT-5, Gemini Pro).  
2. The query is embedded and matched against **Supabase Vector** entries.  
3. Retrieve top-K similar results filtered by:
   - `status = active`
   - `models` containing current model
4. Apply similarity threshold (e.g. cosine > 0.8).  
5. Inject relevant snippets into the chat context before generation.  
6. Optionally display:
   > “ℹ️ This answer was enhanced using custom data: *{RAG Title}*”

---

## 🧠 Multi-Model Assignment

- Each RAG entry can target **one or multiple models**.  
- Only those assigned models can access the RAG during inference.  
- If no model is assigned, it defaults to **all active models**.  
- Admin UI should include a **multi-select model dropdown**.

---

## 🧮 Versioning & Audit Trail

- Every update increments the version number.
- Change logs include:
  - Editor ID
  - Timestamp
  - Diff between old and new content
- Supports rollback to any previous version.
- Deleted entries are soft-deleted for recovery and compliance.

---

## 🧭 Admin Dashboard

### **Functions**
- Add / Edit / Delete / Activate / Deactivate RAGs  
- Filter by:
  - Status (Active / Inactive / Archived)
  - Model type
  - Tag or Category
  - Added by Admin
- Bulk actions for faster moderation.

### **Implemented Console**
- `/admin/rag` now exposes a dedicated dashboard with live filtering, analytics cards, and bulk actions.
- Version history (with rollback) surfaces inside the edit sheet alongside model/tag management.
- Multi-select model picker, tag chips, and structured text inputs ensure clean metadata.
- Category selector appears before the title field, with an inline “Add category” shortcut so admins can create News/Study/etc. buckets on the fly.
- Every action (create/update/status/bulk) records an audit entry via `rag.entry.*` events.

### **Analytics**
- Most frequently retrieved RAGs  
- Model-wise usage statistics  
- Per-admin contribution metrics  

### **Permissions**
- **Admin:** Full control  
- **Creator:** Add & edit only their own entries  
- **Viewer:** Read-only access  

---

## ⚡ Supabase Vector Integration

- **Supabase Vector** serves as the semantic index for all RAG entries.  
- Embeddings are generated via the chosen provider (e.g. OpenAI Embeddings API, Gemini, or custom).  
- Embeddings and metadata are stored in Supabase Vector tables for similarity search.  
- Implementation (insertion, query, and update) can use `supabase-js`, `Edge Functions`, or direct SQL — **developer’s choice**.
- The repo now ships with `supabase/rag-vector.sql` containing the required table and `match_rag_embeddings` RPC. Run it once per environment to provision pgvector storage.
- Server-side helpers (`lib/rag/supabase.ts`) talk to Supabase via REST, so no extra SDK is required.
- Query-time filters ensure only `status = active` records that include the current model are surfaced.

### **Manual SQL for new records**
When you need to insert a RAG entry outside the admin console (e.g. migration or hotfix), use SQL instead of running migrations:

```sql
INSERT INTO "RagEntry" (
  id,
  title,
  content,
  type,
  status,
  tags,
  models,
  addedBy
) VALUES (
  gen_random_uuid(),
  'KhasiGPT Terms of Service',
  'Official policy text…',
  'text',
  'active',
  ARRAY['policy','legal'],
  ARRAY[]::text[],
  '<ADMIN_ID>'
);
```

After insertion, run the Supabase upsert script (or trigger a re-embed from the admin UI) so the vector store stays in sync.

--- 

## 🏗️ Scalability & Optimization

- Async embedding generation using background queues or Supabase Edge Functions  
- Redis caching for frequent queries  
- Batch embedding for large document uploads  
- Scheduled re-indexing for outdated or inactive data  
- Auto-sharding support for enterprise datasets  

---

## 💬 User Experience

- When a user chats:
  - The system checks Supabase Vector for related entries.
  - Injects relevant data into prompt context.
  - Falls back to model-only response if no RAG applies.  
- User option: **Toggle “Use Custom Knowledge”** per chat session.

---

## 🧱 Advanced Features

- Multi-language support (Khasi, Pnar, English)
- Auto-tagging & NLP topic detection  
- Feedback scoring (👍 / 👎 per entry)  
- External sync (Google Drive, Notion, Docs)  
- Model-specific prompt templates  
- Cost & usage throttling by model  

---

## 🔐 Security & Compliance

- Data stored in a **private Supabase schema**  
- Protected via **Supabase Auth & RLS**  
- Sanitize all uploaded text and files  
- Full audit logging of:
  - Access events
  - Edits
  - Retrievals  

---

## ✅ Example

**RAG Entry:** *KhasiGPT Privacy Policy*  
- Models: `["gpt-5", "gemini-pro"]`  
- Status: `active`  
- Added by: Admin-1  
- Date: 2025-11-11  

When a GPT-5 chat asks:  
> “What is KhasiGPT’s privacy policy?”  
The system retrieves this RAG entry from Supabase Vector and injects it into the prompt.  
If the same query is asked using **Mistral**, it is ignored since that model isn’t linked.

---

## 🧾 Summary

> Build a **Supabase Vector-powered RAG system** that supports:
> - Multi-modal content ingestion  
> - Multi-model targeting  
> - Versioning, analytics, and audit trail  
> - Admin control over activation and lifecycle  
> - Secure, scalable, and multilingual semantic retrieval  

---

**End of RAGS.md**
