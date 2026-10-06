# Chat upload retention and monitoring

No total storage quota or AI spending cap is added. Existing file-size, attachment-count and request limits remain. The private chat-file store is monitored separately from avatars, contact files, jobs/RAG assets and other storage namespaces.

- Unused chat uploads become eligible after at least 24 hours.
- Files referenced only by soft-deleted chats become eligible after at least seven days from the latest referenced chat deletion.
- A file referenced by any active chat is retained, including expired signed URLs and reuse in another chat.
- Configured character images and `home.iconPrompts` assets also receive retention holds: they use the shared uploader but need not appear in a chat. Removing a shared hold starts a new seven-day grace period.
- Formerly attached files removed by message edits or permanent chat deletion have a seven-day grace period.
- Cleanup removes eligible physical files, not chat/message text. An admin cannot restore a chat whose attachments are already claimed for cleanup or deleted. The Deleted Chats view warns about this deadline.

## Scheduling and review

Vercel invokes `/api/cron/chat-storage-cleanup` daily at `0 2 * * *` (UTC). Hobby scheduling can occur within that hour. Retention durations are minimum grace periods, not promises of deletion at an exact time. A run reconciles at most two inventory pages of 500 objects and claims at most 250 eligible files. Larger backlogs carry over; inspect deferred work and failed deletions in the admin console.

The existing protected `CRON_SECRET` authenticates the scheduled request. No secret is embedded in source or exposed by an admin API. Unauthorized cron requests fail with 401. The endpoint supports authenticated `?dryRun=1` diagnostics, which never claim or delete objects.

`/admin/storage` shows confirmed per-account bytes and file counts, inventory status, recent maintenance results and failed work. Accounts at or above 1 GiB receive a review alert and an admin navigation badge. This is not a blocking allowance, an email notification, or a restriction on purchased credits.

The **Check storage inventory** button invokes a fresh-admin-only, same-origin POST. It always runs in dry mode, regardless of any supplied query/body. It reconciles metadata without deleting or claiming files and is limited to five checks per hour per administrator. The UI disables repeat clicks and displays a terminal success/failure state. Inventory and alert failures are isolated from other admin pages and user startup.

The storage summary uses one validated JSON database snapshot. Four concurrent statements on the production client's single pipeline stalled during live verification; one snapshot avoids that queue interaction and keeps totals and account rows consistent without increasing timeout limits. Account sorting uses the numeric byte column before converting it to display text.

Maintenance reads its persisted inventory timestamp explicitly as text and writes it back as `timestamptz`. The production pooler returns timestamps as strings; assuming a JavaScript Date caused the second inventory run to fail before saving its cursor. A repeated-run regression check covers this boundary.

## Safety and accounting

Migrations `0119_chat_file_lifecycle.sql` and `0120_shared_upload_holds.sql` create private metadata, indexed references and due dates, ownership totals, a durable inventory cursor, and a maintenance lease. They index existing Message/Message_v2, Character and prompt-icon references before cleanup is deployed. Unsupported owned references abort indexing rather than silently becoming orphans. RLS and revoked public/anonymous/authenticated privileges keep this metadata server-only.

PostgreSQL triggers update references in the same transaction as message/configuration writes, including web and native clients. File row locks serialize these writes and chat restoration with cleanup claims. Active references are checked again when a claim is made. A failed or uncertain object deletion retains its tombstone and recorded usage for an idempotent retry; it does not reopen the file for new attachment/restoration. Deletions use a fresh metadata check and conditional ETag match. Changed objects are held for review. Per-object inventory upserts commit separately to avoid holding one file/account lock while waiting on another upload.

New private uploads reserve metadata before storing an object and confirm it afterward. Matching inventory observations can confirm the same upload without counting it twice. Unknown legacy files remain protected until inventory confirms their metadata. No object in unrelated namespaces is a cleanup target. Indexed due dates avoid scanning active file histories in each cleanup run.

The worker has a five-minute run lease, three deletion workers and a 210-second work budget under a 300-second function limit. It does not read file contents or send them to an AI provider. Aggregate metadata and safe result counts are reported; signed tokens, file contents and credentials are not logged by maintenance.

## Operations

Apply migrations with `pnpm db:migrate` before deploying. Verify the cron entry in the Vercel dashboard, use the admin inventory check, and confirm that normal uploads and retained chat files still work. Disable only this cron job if cleanup must be stopped; application deployment rollback alone does not remove a Vercel cron schedule. Keep metadata and reference triggers in place. Do not reset deletion claims automatically after an uncertain storage result: review the physical object and references first.

Daily scheduling, bounded batches and unavailable services can delay cleanup. The storage page distinguishes incomplete inventory and failed runs from confirmed zero usage. This does not prevent account farming, cap provider spending, or impose a storage quota.
