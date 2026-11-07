import crypto from "crypto";

/**
 * AES-256-GCM symmetric encryption for sensitive user secrets (API keys).
 *
 * The master key is read from `AI_CONFIG_ENCRYPTION_KEY`. It may be provided as:
 *   - 64-char hex   (e.g. `openssl rand -hex 32`)
 *   - 44-char base64 (e.g. `openssl rand -base64 32`)
 *   - 32-char utf-8 string
 *
 * Ciphertext format: `v1:<ivHex>:<authTagHex>:<payloadHex>`
 * The auth tag + IV mean tampering or a wrong key fails fast on decrypt.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV is recommended for GCM

class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    throw new EncryptionKeyError(
      "AI_CONFIG_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` and add it to your environment."
    );
  }

  const trimmed = raw.trim();
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    buf = Buffer.from(trimmed, "hex");
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed) || /^[A-Za-z0-9+/]{44}$/.test(trimmed)) {
    buf = Buffer.from(trimmed, "base64");
  } else if (trimmed.length === 32) {
    buf = Buffer.from(trimmed, "utf-8");
  } else {
    throw new EncryptionKeyError(
      "AI_CONFIG_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars, base64, or 32 utf-8 chars)."
    );
  }

  if (buf.length !== 32) {
    throw new EncryptionKeyError("AI_CONFIG_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  cachedKey = buf;
  return buf;
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new Error("encrypt() expects a string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith("v1:")) {
    throw new Error("Cannot decrypt: payload is not a v1 ciphertext");
  }
  const [version, ivHex, authTagHex, dataHex] = payload.split(":");
  if (version !== "v1" || !ivHex || !authTagHex || !dataHex) {
    throw new Error("Cannot decrypt: malformed ciphertext");
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

/** True when a master key is present and well-formed. */
export function isEncryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
