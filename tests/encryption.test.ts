import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@/common/utils/encryption.js';

describe('Encryption Utility', () => {
  it('encrypts and decrypts secrets using AES-256-GCM', () => {
    const plaintext = 'sk_live_very_secret_api_key_12345';
    const encrypted = encryptSecret(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('safely handles non-encrypted fallback strings', () => {
    const plain = 'unencrypted_string';
    expect(decryptSecret(plain)).toBe(plain);
  });
});
