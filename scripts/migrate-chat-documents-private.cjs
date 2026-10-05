// Run with explicit source BLOB_READ_WRITE_TOKEN and destination
// CHAT_DOCUMENT_BLOB_STORE_ID + VERCEL_OIDC_TOKEN (or private read/write token).
// Default is inventory only. --copy verifies private copies. --retire-public
// requires a deployed, verified private reader and rechecks each copy before
// deleting its public original. No names, URLs, contents, or tokens are logged.
const { createHash } = require('node:crypto');
const { list, put, get, del } = require('@vercel/blob');
const keyPattern = /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(pdf|docx)$/;
const maxBytes = 5 * 1024 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function boundedBody(stream, size) {
  if (size > maxBytes) throw new Error('File exceeds permitted size');
  const chunks = []; let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error('File exceeds permitted size');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function migrate() {
  const sourceToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!sourceToken) throw new Error('Missing source storage configuration');
  const retire = process.argv.includes('--retire-public');
  const copy = retire || process.argv.includes('--copy');
  const destination = {
    token: process.env.CHAT_DOCUMENT_BLOB_READ_WRITE_TOKEN || undefined,
    storeId: process.env.CHAT_DOCUMENT_BLOB_STORE_ID || undefined,
    access: 'private', useCache: false,
  };
  if (copy && !destination.token && !destination.storeId) throw new Error('Missing private storage configuration');
  let cursor; let documents = 0; let totalBytes = 0; let verified = 0; let retired = 0;
  do {
    const page = await list({ token: sourceToken, prefix: 'uploads/', cursor, limit: 1000 });
    for (const file of page.blobs) {
      if (!keyPattern.test(file.pathname)) continue;
      documents++; totalBytes += file.size;
      if (!copy) continue;
      const response = await fetch(file.url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      if (!response.ok || !response.body) throw new Error('Public source unavailable');
      const original = await boundedBody(response.body, file.size);
      let existing = await get(file.pathname, destination);
      if (!existing) {
        await put(file.pathname, original, {
          token: destination.token, storeId: destination.storeId,
          access: 'private', addRandomSuffix: false, allowOverwrite: false,
          contentType: file.pathname.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        existing = await get(file.pathname, destination);
      }
      if (existing?.statusCode !== 200) throw new Error('Private copy unavailable');
      const privateBytes = await boundedBody(existing.stream, existing.blob.size);
      if (hash(original) !== hash(privateBytes)) throw new Error('Copy verification failed');
      const anonymous = await fetch(existing.blob.url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      await anonymous.body?.cancel();
      if (anonymous.ok) throw new Error('Destination is publicly accessible');
      verified++;
      if (retire) { await del(file.url, { token: sourceToken }); retired++; }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(JSON.stringify({ documents, totalBytes, verified, retired, mode: retire ? 'retire-public' : copy ? 'copy' : 'inventory' }));
}

if (require.main === module) migrate().catch(() => {
  console.error('Document migration stopped. Originals are retained unless a private copy was verified. No sensitive details logged.');
  process.exitCode = 1;
});
module.exports = { migrate, keyPattern, boundedBody };
