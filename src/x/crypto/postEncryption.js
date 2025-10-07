// src/x/crypto/postEncryption.js

import { xsalsa20poly1305 } from "@noble/ciphers/salsa";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { x25519 } from "@noble/curves/ed25519";

/**
 * Post Encryption Utilities
 *
 * Handles encryption of post content for subscriber-only posts:
 * 1. Generate random post encryption key (X25519 keypair)
 * 2. Encrypt descriptor text fields with post key
 * 3. Encrypt post key for each recipient using their reading key
 */

export const POST_ENCRYPTION_TYPE = "x25519-xsalsa20-poly1305";

/**
 * Generate a random X25519 keypair for post encryption
 * @returns {object} - { secretKey: hex string, publicKey: hex string }
 */
export function generatePostEncryptionKey() {
  const secretKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(secretKey);

  return {
    secretKey: bytesToHex(secretKey),
    publicKey: bytesToHex(publicKey),
  };
}

/**
 * Encrypt text using post encryption key
 * @param {string} text - Plain text to encrypt
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @param {boolean} combined - If true, return nonce+ciphertext as single string
 * @returns {object|string} - { ciphertext: hex, nonce: hex } or combined "nonce:ciphertext"
 */
export function encryptText(text, postSecretKeyHex, combined = true) {
  if (!text) return null;

  const textBytes = new TextEncoder().encode(text);
  const secretKey = hexToBytes(postSecretKeyHex);
  const nonce = randomBytes(24);

  // Use post secret key directly as the encryption key
  const cipher = xsalsa20poly1305(secretKey, nonce);
  const ciphertext = cipher.encrypt(textBytes);

  const nonceHex = bytesToHex(nonce);
  const ciphertextHex = bytesToHex(ciphertext);

  if (combined) {
    // Return nonce:ciphertext as single string
    return `${nonceHex}:${ciphertextHex}`;
  }

  return {
    ciphertext: ciphertextHex,
    nonce: nonceHex,
  };
}

/**
 * Decrypt text using post encryption key
 * @param {string} ciphertextHex - Encrypted text (hex) or combined "nonce:ciphertext"
 * @param {string} nonceHex - Nonce (hex) - optional if ciphertextHex is combined format
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {string} - Decrypted plain text
 */
export function decryptText(ciphertextHex, nonceHex, postSecretKeyHex) {
  // Check if ciphertextHex is in combined format "nonce:ciphertext"
  let actualNonceHex = nonceHex;
  let actualCiphertextHex = ciphertextHex;

  if (!nonceHex && ciphertextHex.includes(':')) {
    // Combined format: "nonce:ciphertext"
    const parts = ciphertextHex.split(':');
    if (parts.length === 2) {
      actualNonceHex = parts[0];
      actualCiphertextHex = parts[1];
    }
  }

  const ciphertext = hexToBytes(actualCiphertextHex);
  const nonce = hexToBytes(actualNonceHex);
  const secretKey = hexToBytes(postSecretKeyHex);

  const cipher = xsalsa20poly1305(secretKey, nonce);
  const plaintext = cipher.decrypt(ciphertext);

  return new TextDecoder().decode(plaintext);
}

/**
 * Encrypt post secret key for a specific recipient using their reading key
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @param {string} recipientPublicKeyHex - Recipient's reading public key (hex)
 * @returns {object} - { encryptedKey: hex, ephemeralPublicKey: hex, nonce: hex }
 */
export function encryptPostKeyForRecipient(postSecretKeyHex, recipientPublicKeyHex) {
  // Generate ephemeral keypair for this recipient
  const ephemeralSecretKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralSecretKey);

  // Compute shared secret with recipient's reading key
  const recipientPublicKey = hexToBytes(recipientPublicKeyHex);
  const sharedSecret = x25519.getSharedSecret(ephemeralSecretKey, recipientPublicKey);

  // Encrypt the post secret key with shared secret
  const postKeyBytes = hexToBytes(postSecretKeyHex);
  const nonce = randomBytes(24);
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const encryptedKey = cipher.encrypt(postKeyBytes);

  return {
    encryptedKey: bytesToHex(encryptedKey),
    ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
    nonce: bytesToHex(nonce),
  };
}

/**
 * Decrypt post secret key using recipient's reading secret key
 * @param {string} encryptedKeyHex - Encrypted post key (hex)
 * @param {string} ephemeralPublicKeyHex - Sender's ephemeral public key (hex)
 * @param {string} nonceHex - Nonce (hex)
 * @param {string} recipientSecretKeyHex - Recipient's reading secret key (hex)
 * @returns {string} - Decrypted post secret key (hex)
 */
export function decryptPostKey(encryptedKeyHex, ephemeralPublicKeyHex, nonceHex, recipientSecretKeyHex) {
  const encryptedKey = hexToBytes(encryptedKeyHex);
  const ephemeralPublicKey = hexToBytes(ephemeralPublicKeyHex);
  const nonce = hexToBytes(nonceHex);
  const recipientSecretKey = hexToBytes(recipientSecretKeyHex);

  // Compute shared secret
  const sharedSecret = x25519.getSharedSecret(recipientSecretKey, ephemeralPublicKey);

  // Decrypt the post key
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const postKeyBytes = cipher.decrypt(encryptedKey);

  return bytesToHex(postKeyBytes);
}

/**
 * Encrypt all text fields in a descriptor locale
 * @param {object} locale - Descriptor locale object
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {object} - Locale with encrypted fields
 */
export function encryptDescriptorLocale(locale, postSecretKeyHex) {
  const encrypted = { ...locale };

  // Encrypt title (combined format: nonce:ciphertext)
  if (locale.title) {
    encrypted.title = encryptText(locale.title, postSecretKeyHex, true);
  }

  // Encrypt text_preview (combined format: nonce:ciphertext)
  if (locale.text_preview) {
    encrypted.text_preview = encryptText(locale.text_preview, postSecretKeyHex, true);
  }

  // Encrypt categories (as JSON string, combined format)
  if (Array.isArray(locale.categories) && locale.categories.length > 0) {
    encrypted.categories = encryptText(JSON.stringify(locale.categories), postSecretKeyHex, true);
  }

  // Encrypt tags (as JSON string, combined format)
  if (Array.isArray(locale.tags) && locale.tags.length > 0) {
    encrypted.tags = encryptText(JSON.stringify(locale.tags), postSecretKeyHex, true);
  }

  // Encrypt chapter titles (combined format)
  if (Array.isArray(locale.chapters)) {
    encrypted.chapters = locale.chapters.map(chapter => {
      if (chapter.title) {
        return {
          ...chapter,
          title: encryptText(chapter.title, postSecretKeyHex, true),
        };
      }
      return chapter;
    });
  }

  return encrypted;
}

/**
 * Build the encryption section for descriptor
 * @param {string} postPublicKeyHex - Post's X25519 public key (hex)
 * @param {Array<object>} recipients - Array of { address, publicKey, scheme, nonce }
 * @param {string} postSecretKeyHex - Post's secret key for encrypting
 * @returns {object} - Encryption section for descriptor
 */
export function buildEncryptionSection(postPublicKeyHex, recipients, postSecretKeyHex) {
  const encryption = {
    type: POST_ENCRYPTION_TYPE,
    key_exchange_alg: "x25519",
    key_exchange_pub_key: postPublicKeyHex,
    recipients: {},
  };

  // Encrypt post key for each recipient
  recipients.forEach(recipient => {
    const encrypted = encryptPostKeyForRecipient(postSecretKeyHex, recipient.publicKey);

    encryption.recipients[recipient.address.toLowerCase()] = {
      pass: encrypted.encryptedKey,
      pass_nonce: encrypted.nonce,
      pass_ephemeral_pub_key: encrypted.ephemeralPublicKey,
      reading_public_key: recipient.publicKey,
      reading_key_scheme: recipient.scheme,
      reading_key_nonce: recipient.nonce,
    };
  });

  return encryption;
}
