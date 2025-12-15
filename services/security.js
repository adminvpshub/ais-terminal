import crypto from 'crypto';

// Constants
const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits
const SALT_LEN = 16;
const IV_LEN = 16;
const TAG_LEN = 16;

/**
 * Derives a cryptographic key from a PIN and a salt.
 * @param {string} pin
 * @param {Buffer} salt
 * @returns {Promise<Buffer>}
 */
function deriveKey(pin, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(pin, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha512', (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

/**
 * Hashes a PIN for storage/verification (using a random salt).
 * Returns format: "salt:hash" (hex encoded)
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function hashPin(pin) {
    const salt = crypto.randomBytes(SALT_LEN);
    const hash = await deriveKey(pin, salt);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verifies a PIN against a stored hash.
 * @param {string} pin
 * @param {string} storedHash "salt:hash"
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, storedHash) {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const derivedHash = await deriveKey(pin, salt);

    // Constant time comparison to prevent timing attacks
    const storedBuffer = Buffer.from(hashHex, 'hex');
    return crypto.timingSafeEqual(derivedHash, storedBuffer);
}

/**
 * Encrypts text using the PIN.
 * Output format: "salt:iv:tag:ciphertext" (hex encoded)
 * @param {string} text
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function encrypt(text, pin) {
    if (!text) return null;

    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = await deriveKey(pin, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts text using the PIN.
 * @param {string} encryptedText "salt:iv:tag:ciphertext"
 * @param {string} pin
 * @returns {Promise<string>}
 */
export async function decrypt(encryptedText, pin) {
    if (!encryptedText) return null;
    if (!encryptedText.includes(':')) {
        // Fallback: If text doesn't look like our encrypted format,
        // it might be legacy plain text (though we plan to migrate all).
        // Or it throws an error.
        throw new Error("Invalid encrypted format");
    }

    const parts = encryptedText.split(':');
    if (parts.length !== 4) throw new Error("Invalid encrypted format components");

    const [saltHex, ivHex, tagHex, ciphertext] = parts;

    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = await deriveKey(pin, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
