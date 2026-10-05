# Private chat documents

PDF and DOCX chat uploads use a private Vercel Blob store. Chat images still use
the existing public store; their preview and model-input access needs a separate
privacy change.

Production/preview configure `CHAT_DOCUMENT_BLOB_STORE_ID` and optionally the
sensitive `CHAT_DOCUMENT_BLOB_READ_WRITE_TOKEN`. The SDK supports Vercel OIDC
with the store ID. Development uses a separate OIDC-only connection with
`CHAT_DOCUMENT_DEV_BLOB_STORE_ID`; pull development settings using a current
Vercel CLI. Do not replace `BLOB_READ_WRITE_TOKEN`, which serves existing public
assets. Never commit pulled environment files.

The upload response retains `{ url, pathname, contentType }` for web and native
clients. The URL is an app download route, which authenticates cookie or native
Bearer sessions, throttles downloads, verifies the token, rechecks the user's
active status/current admin role, and checks object ownership before reading
the private store. It does not fetch the public URL or fall back to public data.
Tokens expire after one hour. Trusted persisted chat-history reads issue fresh
tokens, including for legacy references; historical parsing uses the same private
storage key. Anonymous/shared-chat viewers receive no document download URL.
Native external-browser opening requires that browser to have an authenticated
web session, as before; the API also supports authenticated native HTTP downloads.

## Existing public documents

Run `scripts/migrate-chat-documents-private.cjs` with the source public
`BLOB_READ_WRITE_TOKEN` and destination store ID plus OIDC (or private token).
The default inventories only PDF/DOCX objects under `uploads/<owner>/<file>`.

1. Run `--copy`. Exact pathnames are retained. Private copies are checked against
   source SHA-256 hashes, and anonymous destination access must fail.
2. Deploy and verify the private reader, upload route, history renewal, and chat
   parsing before retiring public originals. No database migration is needed.
3. Run `--retire-public` only after that verification. Every source is rechecked
   against its private copy before deletion. The command is resumable and does
   not overwrite existing private objects or touch chat images/public assets.
4. Verify the original public URLs no longer return file content and the private
   copies remain readable through authenticated app requests. Retain a private
   migration manifest for operational verification; never log file contents/URLs.

Removing public originals can take time to invalidate CDN copies. Files already
downloaded by someone cannot be recalled. After retirement, rollback must retain
the private reader; older public-only releases cannot read these documents.
