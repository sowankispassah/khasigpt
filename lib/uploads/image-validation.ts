import sharp from "sharp";

export async function validateImageBytes(bytes: Buffer, allowWebp = false) {
  // Reject other formats before native decoding, including SVG/XML payloads.
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp =
    allowWebp &&
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!png && !jpeg && !webp) throw new Error("Invalid image.");
  const metadata = await sharp(bytes, {
    limitInputPixels: 16_000_000,
    animated: false,
  }).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 8192 ||
    metadata.height > 8192 ||
    metadata.width * metadata.height > 16_000_000 ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Image dimensions exceed limits.");
  if (metadata.format === "png") return "image/png";
  if (metadata.format === "jpeg") return "image/jpeg";
  if (allowWebp && metadata.format === "webp") return "image/webp";
  throw new Error("Invalid image type.");
}
