import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { type ReceiptData, receiptAmount } from "./receipt-data";

export async function createReceiptPdf(receipt: ReceiptData) {
  if (!receipt.amountVerified) throw new Error("Receipt amount is not verified");
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "lib/payments/fonts/Geist-Regular.ttf"));
  const font = await document.embedFont(fontBytes, { subset: true });
  const supported = new Set(font.getCharacterSet());
  let page = document.addPage([595.28, 841.89]);
  const ink = rgb(0.09, 0.16, 0.14);
  const muted = rgb(0.4, 0.45, 0.43);
  let y = 760;
  function text(value: string, size = 11, color = ink) {
    function draw(line: string) {
      if (y < 60) { page = document.addPage([595.28, 841.89]); y = 760; }
      page.drawText(line, { x: 56, y, size, font, color });
      y -= size + 6;
    }
    // Wrap even long order identifiers; remove control characters from data.
    const clean = Array.from(value.replace(/[\r\n\t]/g, " ")).map((char) => supported.has(char.codePointAt(0) ?? 0) ? char : "?").join("");
    let line = "";
    for (const char of clean) {
      if (font.widthOfTextAtSize(line + char, size) > 483) {
        draw(line);
        line = "";
      }
      line += char;
    }
    draw(line);
    y -= 3;
  }
  text("KhasiGPT", 27);
  text("PAYMENT RECEIPT", 12, muted);
  y -= 18;
  text(`Receipt: ${receipt.number}`);
  text(`Paid: ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(receipt.paidAt))} IST`);
  text("Status: Paid");
  if (receipt.testPurchase) text("Test purchase - no money charged", 11, muted);
  y -= 20;
  text("CUSTOMER", 10, muted);
  if (receipt.name) text(receipt.name);
  text(receipt.email);
  y -= 20;
  text("SUBSCRIPTION / RECHARGE", 10, muted);
  text(receipt.planName, 16);
  y -= 12;
  page.drawRectangle({ x: 48, y: y - 56, width: 499, height: 70, color: rgb(0.93, 0.97, 0.95) });
  y -= 25;
  text(`Amount paid: ${receiptAmount(receipt)}`, 21);
  y -= 33;
  text(`Order reference: ${receipt.orderId}`, 10, muted);
  if (receipt.paymentId) text(`Payment reference: ${receipt.paymentId}`, 10, muted);
  y -= 24;
  text("Thank you for your purchase.", 11);
  text("Keep this receipt for your records.", 10, muted);
  text("khasigpt.com", 10, muted);
  document.setTitle(`KhasiGPT receipt ${receipt.number}`);
  document.setAuthor("KhasiGPT");
  document.setCreationDate(new Date(receipt.paidAt));
  return Buffer.from(await document.save());
}
