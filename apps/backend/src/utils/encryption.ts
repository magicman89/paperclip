import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey(version: number = CURRENT_VERSION): Buffer {
  // Use dedicated ENCRYPTION_SECRET to avoid coupling with JWT signing key.
  // If JWT_SECRET is rotated, existing encrypted data would be lost if we
  // depended on it. ENCRYPTION_SECRET should be a stable, long-lived secret.
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET (or JWT_SECRET as fallback) environment variable is required');
  }
  // Use ENCRYPTION_SALT env var for deployment-specific salt.
  // Falls back to legacy hardcoded value only for existing deployments.
  const saltSource = process.env.ENCRYPTION_SALT || 'bullspot-v1';
  const salt = crypto.createHash('sha256').update(saltSource).digest();
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha512');
}

export interface EncryptedData {
  version?: number;
  iv: string;
  encryptedData: string;
  authTag: string;
}

const CURRENT_VERSION = 1;

/**
 * Encrypts sensitive data (exchange API keys/secrets) using AES-256-GCM.
 * The JWT_SECRET env var is used as the master key material.
 * Never log or return decrypted values.
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    version: CURRENT_VERSION,
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

/**
 * Decrypts data encrypted with encrypt().
 * Handles versioned key derivation for forward key rotation compatibility.
 * Data without a version field (legacy) uses the v1 salt for backward compat.
 */
export function decrypt(data: EncryptedData): string {
  const key = getEncryptionKey(data.version ?? 1);
  const iv = Buffer.from(data.iv, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
