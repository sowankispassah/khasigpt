# Private chat documents and images

PDF/DOCX uploads, PNG/JPEG uploads and generated chat images use the same private
Vercel Blob store. Public marketing, avatar and admin reference assets stay in
the existing public store.

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
storage key. Anonymous/shared-chat viewers receive no private attachment URL.
Image responses are inline and bypass the public Next.js optimizer; the web
preview already uses an unoptimized image element so cookies reach the route.
Chat model input uses owned bytes, with at most four images retained from the
current request and recent history. Arbitrary remote image URLs are rejected.
Image edits also read owned private objects rather than fetching app links.
Uploads remain capped at 5 MiB; generated images have a separate 10 MiB bound.
Native thumbnails, the zoom viewer and downloads attach the saved session only
to the exact configured app origin and private file endpoint. Older Android
builds need the accompanying native update to display authenticated previews.
Native external-browser opening requires that browser to have an authenticated
web session, as before; the API also supports authenticated native HTTP downloads.

## Existing public documents and images

Run `scripts/migrate-chat-documents-private.cjs` with the source public
`BLOB_READ_WRITE_TOKEN` and destination store ID plus OIDC (or private token).
The default inventories PDF/DOCX/PNG/JPEG objects under `uploads/<owner>/<file>`
and PNG/JPEG objects under `generated-images/<owner>/<chat>/<file>`.

1. Run `--copy`. Exact pathnames are retained. Private copies are checked against
   source SHA-256 hashes, and anonymous destination access must fail.
2. Deploy and verify the private reader, upload route, history renewal, and chat
   parsing, image previews and image input before retiring public originals.
   No database migration is needed.
3. Run `--retire-public` only after that verification. Every source is rechecked
   against its private copy before deletion. The command is resumable and does
   not overwrite existing private objects or touch unrelated public assets.
4. Verify the original public URLs no longer return file content and the private
   copies remain readable through authenticated app requests. Retain a private
   migration manifest for operational verification; never log file contents/URLs.

Removing public originals can take time to invalidate CDN copies. Files already
downloaded by someone cannot be recalled. After retirement, rollback must retain
the private reader; older public-only releases cannot read these attachments.
