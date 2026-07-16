import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MEDIA_ROOT = path.join(process.cwd(), "data", "whatsapp-media");
const types: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function normaliseImageType(mimetype: string) {
  const value = mimetype.split(";", 1)[0].trim().toLowerCase();
  return value === "image/jpg" ? "image/jpeg" : value;
}

export function supportedWhatsAppImageType(mimetype: string) {
  return normaliseImageType(mimetype) in types;
}

export async function saveWhatsAppImage(base64: string, mimetype: string) {
  const normalisedType = normaliseImageType(mimetype);
  if (!supportedWhatsAppImageType(normalisedType)) {
    throw new Error("Unsupported image type");
  }
  const bytes = Buffer.from(
    base64.replace(/^data:[^;]+;base64,/, ""),
    "base64",
  );
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
    throw new Error("Image must be smaller than 8 MB");
  }
  await mkdir(MEDIA_ROOT, { recursive: true });
  const filename = `${randomUUID()}.${types[normalisedType]}`;
  await writeFile(path.join(MEDIA_ROOT, filename), bytes, { flag: "wx" });
  return { token: `local:${filename}`, bytes: bytes.length };
}

export async function readWhatsAppImage(token: string) {
  if (!token.startsWith("local:")) return null;
  const filename = token.slice(6);
  if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) return null;
  const extension = path.extname(filename).slice(1).toLowerCase();
  const mimetype =
    Object.entries(types).find(([, value]) => value === extension)?.[0] ||
    "application/octet-stream";
  return { bytes: await readFile(path.join(MEDIA_ROOT, filename)), mimetype };
}

export async function removeWhatsAppImage(token: string) {
  if (!token.startsWith("local:")) return;
  const filename = token.slice(6);
  if (!/^[a-f0-9-]+\.(jpg|png|webp|gif)$/i.test(filename)) return;
  await unlink(path.join(MEDIA_ROOT, filename)).catch(() => undefined);
}
