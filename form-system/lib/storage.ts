import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { check } from "./errors";
export interface StorageService {
  put(bytes: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalStorage implements StorageService {
  private root = path.resolve(
    /*turbopackIgnore: true*/ process.env.STORAGE_PATH ?? "./storage",
  );
  private path(key: string) {
    check(/^[a-f0-9-]{36}$/.test(key), 400, "کلید فایل نامعتبر است.");
    return path.join(this.root, key);
  }
  async put(bytes: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    await writeFile(this.path(key), bytes, { mode: 0o600, flag: "wx" });
    return key;
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  remove(key: string) {
    return unlink(this.path(key));
  }
}
export const storage = new LocalStorage();

const IMAGE_MAX = 5 * 1024 * 1024;
const DOCUMENT_MAX = 50 * 1024 * 1024;

function sniffDocument(bytes: Buffer): string | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-")
    return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 6 &&
    (bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
      bytes.subarray(0, 6).toString("ascii") === "GIF89a")
  )
    return "image/gif";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
    return "application/msword";
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // ZIP container: docx / xlsx / odt / ods / plain zip of docs
    const head = bytes.subarray(0, Math.min(bytes.length, 8000)).toString("binary");
    if (head.includes("word/"))
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (head.includes("xl/"))
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (head.includes("mimetypeapplication/vnd.oasis.opendocument"))
      return "application/vnd.oasis.opendocument.text";
    return "application/zip";
  }
  // plain text (UTF-8 / ASCII only, no NULs in first 4KB)
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.length && !sample.includes(0) && sample.every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127) || b >= 128))
    return "text/plain";
  return null;
}

export async function cleanUpload(file: globalThis.File) {
  check(
    file.size > 0 && file.size <= IMAGE_MAX,
    400,
    "حداکثر اندازه تصویر ۵ مگابایت است.",
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  // Only decoded and re-encoded raster images are accepted. No SVG, HTML or executable documents.
  const meta = await sharp(bytes, { limitInputPixels: 16000000 })
    .metadata()
    .catch(() => null);
  check(
    meta && ["jpeg", "png", "webp"].includes(meta.format ?? ""),
    400,
    "فقط تصویر JPEG، PNG یا WebP معتبر مجاز است.",
  );
  const cleaned = await sharp(bytes, { limitInputPixels: 16000000 })
    .rotate()
    .resize({
      width: 2400,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { bytes: cleaned, mime: "image/jpeg" };
}

export async function cleanDocumentUpload(file: globalThis.File) {
  check(
    file.size > 0 && file.size <= DOCUMENT_MAX,
    400,
    "حداکثر اندازه هر مدرک ۵۰ مگابایت است.",
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffDocument(bytes);
  check(
    !!mime,
    400,
    "فرمت مدرک مجاز نیست. PDF، تصویر، Word، Excel، Zip یا متن ساده بفرستید.",
  );
  return { bytes, mime: mime! };
}
