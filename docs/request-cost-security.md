# Public chat request and cost bounds

The web and native clients share these backend checks. Limits are authoritative
on the server; existing client error handling still applies.

| Surface | Limit |
| --- | --- |
| Chat JSON | 128 KiB of actual streamed bytes |
| Current user message | 12 parts, 8,000 total text characters, 4 files |
| Model context | 128 messages, 512 KiB serialized non-file content, 4 file parts |
| Generated output | 2,048 tokens on the free path; 4,096 on the wallet path |
| File upload | 5 MiB file plus 16 KiB multipart overhead, exactly one field |
| File upload attempts | Shared account quota of 30 per 10 minutes |
| Avatar | 2 MiB decoded file; shared web/native quota of 10 attempts per 10 minutes |
| Chat create/edit/share Server Actions | Validated identifiers and arguments; shared account quota of 60 per minute |
| Chat image bytes | Recognized PNG/JPEG, at most 16 million pixels and 8,192 per dimension |
| Avatar image bytes | Same bounds, with WebP also accepted |
| Image generation JSON | 128 KiB; intent JSON 64 KiB |

Content-Length is an early rejection hint, not the authority. The reader counts
actual bytes and cancels excess input. Oversized bodies return 413 with no-store;
invalid content returns existing generic client-compatible errors. This does not
replace the hosting platform's duration limits or protect against slow bodies by
itself. Vercel may impose a smaller incoming request limit than the app's 5 MiB.

The existing paid generation lease, input cost estimation, affordable output
calculation and image credit reservation remain in place. The new model wrapper
also bounds free generation and auxiliary calls using the chat model. Small
classification/translation calls have explicit output caps and no automatic
provider retries. Provider and model choices remain admin controlled.
Chat title generation is an internal server-only helper rather than a callable
Server Action, sends only bounded user text, and caps output at 256 tokens.
Chat editing and visibility actions require an authenticated owner, even when
invoked directly as a Server Action POST. Auth, counter and ownership lookup
failures deny mutations. Chat creation validates its inputs and shares the quota.

## Private chat document parsing

Uploads must contain an extractable PDF (at most 100 pages) or DOCX. Scanned PDFs
without embedded text are rejected: private chat attachments no longer invoke
unmetered OCR. Extracted text stops at 32,000 characters. DOCX checks include
central/local directory agreement, unique safe names, a maximum of 512 entries,
8 MiB per inflated entry, 32 MiB total, a 100x ratio and bounded actual inflation.
ZIP64 and encrypted archives are rejected. This can reject unusually compressed
but otherwise legitimate documents; relax only after reviewing the resource bound.

Parsing runs in a disposable child process with a 128 MiB V8 heap ceiling, no
application credentials in its environment, and a 15-second terminating deadline.
The supervisor waits for process exit before releasing capacity. At most two
parsers run per server instance, without a waiting queue. This provides process
crash isolation; it is not an OS network sandbox or a hard total RSS limit.

Chat reparses at most four recent unique private documents sequentially, after
ownership validation. Successful text has a bounded instance-local cache (16
entries, ten minutes), keyed by owner, MIME and content hash. Private storage is
still read to compute that hash. The cache is neither durable nor shared globally.

The standalone CommonJS worker and its parser dependencies must be included in
both /api/chat and /api/files/upload function traces. Use explicit Node spawn with
IPC: Turbopack incorrectly resolves the filename supplied to child_process.fork
as an import (upstream issue vercel/next.js#97952). Test both PDF and DOCX against
the deployed upload route after changing packaging. Published jobs, admin RAG
ingestion and study paper parsing use their existing separate extraction path.
Trace runtime entries, CMaps, fonts and WASM assets; avoid copying unused browser
bundles and extra source maps. Including all distribution variants exceeded Vercel's
250 MB uncompressed function limit. The test enforces a smaller trace budget to
leave deployment headroom. Static dependency references retain package
aliases without initializing native parser libraries in the request process.

## Verification and remaining controls

The targeted suites cover actual stream cancellation, missing/dishonest length
headers, malformed/extra multipart fields, spoofed images, pixel bounds, real
PDF/DOCX parsing, compressed bombs, excessive pages, parser deadline and capacity,
actual SDK output caps and paid wallet clamping. Disposable database HTTP tests
exercise normal chat streaming and the shared web/native avatar quota.
Ownership regressions exercise direct compiled Server Action POSTs from an
anonymous context, another authenticated account, and the chat owner. The package
test stages only the upload function's traced files outside the development repo,
preserves package aliases inside that temporary tree, and parses both file formats.

Separate launch items remain: edge WAF/bot controls, aggregate daily AI spending
and account-farming controls, storage quotas/cleanup, monitoring and alerting, and
trusted live-session metering before public voice access. Per-request ceilings
bound individual work; they do not guarantee protection from every distributed
attack or impose an aggregate site-wide spending ceiling.
