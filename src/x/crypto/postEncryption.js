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
 * 2. Encrypt descriptor text fields (preview, chapter titles) with post key
 *    Note: Post titles, tags, and categories are NOT encrypted
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
  console.log('[POST_DECRYPT] ========== decryptPostKey START ==========');

  // Log input parameters (hex strings before conversion)
  console.log('[POST_DECRYPT] Input parameters:');
  console.log('  - encryptedKeyHex length:', encryptedKeyHex.length, 'chars');
  console.log('  - encryptedKeyHex (full):', encryptedKeyHex);
  console.log('  - ephemeralPublicKeyHex length:', ephemeralPublicKeyHex.length, 'chars');
  console.log('  - ephemeralPublicKeyHex (full):', ephemeralPublicKeyHex);
  console.log('  - nonceHex length:', nonceHex.length, 'chars');
  console.log('  - nonceHex (full):', nonceHex);
  console.log('  - recipientSecretKeyHex length:', recipientSecretKeyHex.length, 'chars');
  console.log('  - recipientSecretKeyHex (full):', recipientSecretKeyHex);

  // Convert to bytes
  const encryptedKey = hexToBytes(encryptedKeyHex);
  const ephemeralPublicKey = hexToBytes(ephemeralPublicKeyHex);
  const nonce = hexToBytes(nonceHex);
  const recipientSecretKey = hexToBytes(recipientSecretKeyHex);

  // Log byte array sizes
  console.log('[POST_DECRYPT] After hexToBytes conversion:');
  console.log('  - encryptedKey:', encryptedKey.length, 'bytes');
  console.log('  - ephemeralPublicKey:', ephemeralPublicKey.length, 'bytes');
  console.log('  - nonce:', nonce.length, 'bytes');
  console.log('  - recipientSecretKey:', recipientSecretKey.length, 'bytes');

  // Compute shared secret
  console.log('[POST_DECRYPT] Computing X25519 ECDH shared secret...');
  const sharedSecret = x25519.getSharedSecret(recipientSecretKey, ephemeralPublicKey);
  console.log('  - sharedSecret length:', sharedSecret.length, 'bytes');
  console.log('  - sharedSecret (full hex):', bytesToHex(sharedSecret));

  // Decrypt the post key
  console.log('[POST_DECRYPT] Creating XSalsa20-Poly1305 cipher...');
  const cipher = xsalsa20poly1305(sharedSecret, nonce);

  // The @noble/ciphers library doesn't expose MAC details, but we can log what we can
  console.log('[POST_DECRYPT] Attempting decryption...');
  console.log('  - Ciphertext (with MAC) length:', encryptedKey.length, 'bytes');
  console.log('  - Expected ciphertext length:', encryptedKey.length - 16, 'bytes (excluding 16-byte MAC)');
  console.log('  - Ciphertext (full hex):', bytesToHex(encryptedKey));

  try {
    const postKeyBytes = cipher.decrypt(encryptedKey);
    const postKeyHex = bytesToHex(postKeyBytes);

    console.log('[POST_DECRYPT] ✓ Decryption SUCCESS');
    console.log('  - postKeyBytes length:', postKeyBytes.length, 'bytes');
    console.log('  - postKeyHex (full):', postKeyHex);
    console.log('[POST_DECRYPT] ========== decryptPostKey END ==========');

    return postKeyHex;
  } catch (error) {
    console.error('[POST_DECRYPT] ✗ Decryption FAILED');
    console.error('  - Error:', error.message);
    console.log('[POST_DECRYPT] ========== decryptPostKey END ==========');
    throw error;
  }
}

/**
 * Encrypt all text fields in a descriptor locale
 * @param {object} locale - Descriptor locale object
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {object} - Locale with encrypted fields
 */
export function encryptDescriptorLocale(locale, postSecretKeyHex) {
  const encrypted = { ...locale };

  // Title is NOT encrypted - it remains public for display in post cards
  // Only the preview and content are encrypted

  // Encrypt text_preview (combined format: nonce:ciphertext)
  if (locale.text_preview) {
    encrypted.text_preview = encryptText(locale.text_preview, postSecretKeyHex, true);
  }

  // Categories and tags are NOT encrypted - they remain public for server indexing

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
 * @param {object} options - Additional options
 * @param {string} options.accessType - Access type (e.g., "for_subscribers_only")
 * @param {string} options.minWeeklyPay - Minimum weekly payment in wei as string
 * @param {boolean} options.allowPurchase - Whether one-time purchase access is allowed
 * @param {string} options.purchasePrice - Purchase price in wei as string
 * @param {string} options.processorAddress - Payment processor address
 * @param {string} options.purchaseToken - Token contract address for purchase payment
 * @returns {object} - Encryption section for descriptor
 */
export function buildEncryptionSection(postPublicKeyHex, recipients, postSecretKeyHex, options = {}) {
  const encryption = {
    type: POST_ENCRYPTION_TYPE,
    key_exchange_alg: "x25519",
    key_exchange_pub_key: postPublicKeyHex,
    recipients: {},
  };

  // Add access_type if provided
  if (options.accessType) {
    encryption.access_type = options.accessType;
  }

  // Add min_weekly_pay if provided
  if (options.minWeeklyPay) {
    encryption.min_weekly_pay = options.minWeeklyPay;
  }

  // Add purchase access fields if enabled
  if (options.allowPurchase) {
    encryption.allow_purchase = true;
    if (options.purchasePrice) {
      encryption.purchase_price = options.purchasePrice;
    }
    if (options.processorAddress) {
      encryption.processor_address = options.processorAddress;
    }
    if (options.purchaseToken) {
      encryption.purchase_token = options.purchaseToken;
    }
  }

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
