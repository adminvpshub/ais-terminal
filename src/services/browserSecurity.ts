// src/services/browserSecurity.ts

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits
const SALT_LEN = 16;
const IV_LEN = 12; // Standard for GCM is 12 bytes
const ALGORITHM = 'AES-GCM';

// Helper: Convert Uint8Array to hex string
function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Convert hex string to Uint8Array
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derives a cryptographic key from a PIN and a salt.
 */
async function deriveKey(pin: string, salt: Uint8Array, extractable: boolean = false): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-512',
    },
    baseKey,
    { name: ALGORITHM, length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/**
 * Hashes a PIN for storage/verification.
 * Returns format: "salt:hash"
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await deriveKey(pin, salt, true);
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const hash = new Uint8Array(exportedKey);
  return `${toHex(salt)}:${toHex(hash)}`;
}

/**
 * Verifies a PIN against a stored hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = fromHex(saltHex);
  const key = await deriveKey(pin, salt, true);
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const derivedHash = new Uint8Array(exportedKey);

  const storedBuffer = fromHex(hashHex);
  if (derivedHash.length !== storedBuffer.length) return false;

  // Simple comparison (timing attacks are less of a concern in browser localStorage,
  // but still good to be careful if it was a server-side check)
  return derivedHash.every((val, i) => val === storedBuffer[i]);
}

/**
 * Encrypts text using the PIN.
 * Returns format: "salt:iv:ciphertext" (ciphertext includes tag)
 */
export async function encrypt(text: string, pin: string): Promise<string | null> {
  if (!text) return null;

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(pin, salt);

  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    data
  );

  const ciphertext = new Uint8Array(encrypted);
  return `${toHex(salt)}:${toHex(iv)}:${toHex(ciphertext)}`;
}

/**
 * Decrypts text using the PIN.
 */
export async function decrypt(encryptedText: string, pin: string): Promise<string | null> {
  if (!encryptedText) return null;

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
      // Compatibility check: Node's format was 4 parts (salt:iv:tag:ciphertext)
      // Since we are changing the architecture, we'll assume new format for new deployments.
      throw new Error("Invalid encrypted format");
  }

  const [saltHex, ivHex, ciphertextHex] = parts;
  const salt = fromHex(saltHex);
  const iv = fromHex(ivHex);
  const ciphertext = fromHex(ciphertextHex);

  const key = await deriveKey(pin, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (e) {
    throw new Error("Decryption failed. Invalid PIN or corrupted data.");
  }
}

/**
 * Checks if the text appears to be encrypted.
 */
export function isEncrypted(text: any): boolean {
    if (!text || typeof text !== 'string') return false;
    const parts = text.split(':');
    // We expect 3 parts for our browser format
    if (parts.length !== 3) return false;
    const hexRegex = /^[0-9a-fA-F]+$/;
    return parts.every(p => hexRegex.test(p));
}
