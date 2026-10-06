// Untrusted chat attachments execute in a disposable worker. No credentials,
// network fetch or paid OCR are used here. The parent terminates slow work.
const { inflateRawSync } = require('node:zlib');
const path = require('node:path');

function checkDocx(buffer) {
  const fail = () => { throw new Error('invalid_archive'); };
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) fail();
  const count = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  const offset = buffer.readUInt32LE(end + 16);
  if (count < 1 || count > 512 || buffer.readUInt16LE(end + 8) !== count || offset + directorySize !== end) fail();
  let cursor = offset; let inflatedTotal = 0; const names = new Set();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = buffer.readUInt16LE(cursor + 8); const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20); const inflated = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28); const extra = buffer.readUInt16LE(cursor + 30); const comment = buffer.readUInt16LE(cursor + 32);
    const local = buffer.readUInt32LE(cursor + 42);
    if ((flags & 1) || ![0,8].includes(method) || inflated > 8*1024*1024 || inflatedTotal + inflated > 32*1024*1024 || inflated > Math.max(1,compressed)*100 || cursor+46+nameLength+extra+comment > end) fail();
    const name = buffer.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if (!name || names.has(name) || name.includes('..') || name.includes('\\') || name.startsWith('/') || name.includes('\0')) fail();
    names.add(name);
    if (local + 30 > offset || buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local+8) !== method || buffer.readUInt16LE(local+6) !== flags) fail();
    const localNameLength = buffer.readUInt16LE(local+26); const localExtra = buffer.readUInt16LE(local+28);
    const start = local+30+localNameLength+localExtra;
    if (start+compressed > offset || buffer.subarray(local+30,local+30+localNameLength).toString('utf8') !== name) fail();
    const bytes = method === 8 ? inflateRawSync(buffer.subarray(start,start+compressed), { maxOutputLength: Math.max(1,inflated) }) : buffer.subarray(start,start+compressed);
    if (bytes.length !== inflated) fail();
    inflatedTotal += bytes.length;
    cursor += 46+nameLength+extra+comment;
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('word/document.xml')) fail();
}

async function main(workerData) {
  const buffer = Buffer.from(workerData.buffer);
  if (!buffer.length || buffer.length > 5*1024*1024) throw new Error('file_size');
  let text = '';
  if (workerData.mediaType === 'application/pdf') {
    if (!buffer.subarray(0,8).toString('ascii').startsWith('%PDF-')) throw new Error('invalid_pdf');
    const { PDFParse } = require(workerData.pdfEntry ? path.resolve(process.cwd(), workerData.pdfEntry) : 'pdf-parse');
    const parser = new PDFParse({ data: buffer, isEvalSupported: false, useSystemFonts: false, maxImageSize: 16_000_000 });
    try {
      const info = await parser.getInfo();
      if (!Number.isSafeInteger(info.total) || info.total < 1 || info.total > 100) throw new Error('page_limit');
      for (let page=1; page<=info.total; page++) {
        text += `${(await parser.getText({partial:[page]})).text}\n`;
        if (text.length > workerData.maxTextChars) break;
      }
    } finally { await parser.destroy(); }
  } else if (workerData.mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    checkDocx(buffer);
    text = (await require('mammoth').extractRawText({buffer})).value;
  } else throw new Error('file_type');
  text = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi,' ').replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  if (!text) throw new Error('no_text');
  process.send({ text:text.slice(0,workerData.maxTextChars), truncated:text.length > workerData.maxTextChars }, () => process.exit(0));
}
process.once('message', data => main(data).catch(() => {
  process.send({ error:'document_rejected' }, () => process.exit(0));
}));
