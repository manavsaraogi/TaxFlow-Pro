import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const k = process.env.PORTAL_ENCRYPTION_KEY;
  if (!k) throw new Error('PORTAL_ENCRYPTION_KEY env var not set');
  const buf = Buffer.from(k, 'hex');
  if (buf.length !== 32) throw new Error('PORTAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12):tag(16):ciphertext — all hex
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid stored password format');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
