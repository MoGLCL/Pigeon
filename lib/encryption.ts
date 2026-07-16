import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[a-f\d]{64}$/i.test(raw)) throw new Error("ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters");
  return Buffer.from(raw, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decrypt(payload: string) {
  const [iv, tag, value] = payload.split(".");
  if (!iv || !tag || !value) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
}
