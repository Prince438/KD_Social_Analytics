import crypto from "node:crypto";
import { env } from "./env";

/**
 * AES-256-GCM encryption for OAuth tokens stored in the database.
 *
 * Output format: `iv:authTag:ciphertext`, all hex-encoded. GCM gives us
 * authenticated encryption (tampering is detected on decrypt).
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = env.ENCRYPTION_KEY;
  // Accept either a 64-char hex string or a base64 string; derive a 32-byte key.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    // Fall back to a SHA-256 digest so any sufficiently long secret works.
    key = crypto.createHash("sha256").update(raw).digest();
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
