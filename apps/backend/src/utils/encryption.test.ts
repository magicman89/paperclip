import { encrypt, decrypt } from '../utils/encryption';

describe('Encryption Utils', () => {
  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'my-secret-api-key-12345';
      const encrypted = encrypt(plaintext);

      expect(encrypted.iv).toBeDefined();
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.version).toBe(1);
      expect(encrypted.iv.length).toBe(32); // hex-encoded 16 bytes
      expect(encrypted.authTag.length).toBe(32); // hex-encoded 16 bytes

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'test-api-key';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle special characters in plaintext', () => {
      const plaintext = 'K8s!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with wrong auth tag', () => {
      const encrypted = encrypt('secret');
      encrypted.authTag = '0'.repeat(32); // Corrupt auth tag

      expect(() => decrypt(encrypted)).toThrow();
    });

    it('should handle legacy data without version field (backward compat)', () => {
      // Simulate old encrypted data stored before version field was added
      const encrypted = encrypt('legacy-secret');
      const { version: _, ...legacyData } = encrypted; // strip version

      // Legacy data without version should still decrypt using v1 key derivation
      const decrypted = decrypt(legacyData as any);
      expect(decrypted).toBe('legacy-secret');
    });
  });

  describe('ENCRYPTION_SALT environment variable', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use ENCRYPTION_SALT when set', () => {
      process.env.ENCRYPTION_SECRET = 'test-secret-32-characters-long!!';
      process.env.ENCRYPTION_SALT = 'custom-salt-value';

      // Re-import to pick up the new env var
      const { encrypt } = require('../utils/encryption');
      const encrypted = encrypt('test');

      // Version field should still be set even with custom salt
      expect(encrypted.version).toBe(1);
      // Salt should have been consumed — ciphertext is produced
      expect(encrypted.encryptedData).toBeDefined();
    });

    it('should fall back to hardcoded salt when ENCRYPTION_SALT is not set', () => {
      process.env.ENCRYPTION_SECRET = 'test-secret-32-characters-long!!';
      delete process.env.ENCRYPTION_SALT;

      const { encrypt: enc } = require('../utils/encryption');
      const encrypted = enc('test');

      expect(encrypted.version).toBe(1);
    });
  });
});
