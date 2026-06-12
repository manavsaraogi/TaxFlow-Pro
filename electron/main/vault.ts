// File: electron/main/vault.ts
// Secure credential vault using AES-256-GCM encryption
// Master key derived from OS keytar + user master password

import crypto from 'crypto';
import { setupLogger } from './logger';

const logger = setupLogger('vault');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const DIGEST = 'sha256';

export interface EncryptedPayload {
  encrypted: string;  // hex
  iv: string;         // hex
  tag: string;        // hex
  salt: string;       // hex
}

let masterKey: Buffer | null = null;

/**
 * Initialize the vault with a master password.
 * The master key is derived using PBKDF2 and held in memory only.
 */
export async function initVault(masterPassword: string, salt?: string): Promise<string> {
  const saltBuffer = salt
    ? Buffer.from(salt, 'hex')
    : crypto.randomBytes(SALT_LENGTH);

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      masterPassword,
      saltBuffer,
      ITERATIONS,
      KEY_LENGTH,
      DIGEST,
      (err, derivedKey) => {
        if (err) {
          logger.error('Vault key derivation failed:', err);
          reject(err);
          return;
        }
        masterKey = derivedKey;
        logger.info('Vault initialized (key in memory)');
        resolve(saltBuffer.toString('hex'));
      }
    );
  });
}

/**
 * Clear master key from memory (lock vault)
 */
export function lockVault(): void {
  if (masterKey) {
    masterKey.fill(0); // Zero out memory
    masterKey = null;
    logger.info('Vault locked - master key cleared from memory');
  }
}

/**
 * Check if vault is unlocked
 */
export function isVaultUnlocked(): boolean {
  return masterKey !== null;
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export function encrypt(plaintext: string): EncryptedPayload {
  if (!masterKey) {
    throw new Error('Vault is locked. Initialize vault first.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    salt: salt.toString('hex'),
  };
}

/**
 * Decrypt an encrypted payload using AES-256-GCM
 */
export function decrypt(payload: EncryptedPayload): string {
  if (!masterKey) {
    throw new Error('Vault is locked. Initialize vault first.');
  }

  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const encryptedBuffer = Buffer.from(payload.encrypted, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Encrypt a password for storage in the database
 * Returns iv and encrypted as separate strings for DB storage
 */
export function encryptPassword(password: string): { encrypted: string; iv: string; tag: string } {
  const payload = encrypt(password);
  return {
    encrypted: payload.encrypted,
    iv: payload.iv,
    tag: payload.tag,
  };
}

/**
 * Decrypt a password from database storage
 */
export function decryptPassword(encrypted: string, iv: string, tag: string): string {
  return decrypt({ encrypted, iv, tag, salt: '' });
}

/**
 * Hash a master password for verification (bcrypt-style using pbkdf2)
 */
export async function hashMasterPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, 64, DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else
        resolve({
          hash: derivedKey.toString('hex'),
          salt: salt.toString('hex'),
        });
    });
  });
}

/**
 * Verify a master password against a stored hash
 */
export async function verifyMasterPassword(
  password: string,
  hash: string,
  salt: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      Buffer.from(salt, 'hex'),
      ITERATIONS,
      64,
      DIGEST,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex') === hash);
      }
    );
  });
}
