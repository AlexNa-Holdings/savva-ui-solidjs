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
export async function decryptPostKey(encryptedKeyHex, ephemeralPublicKeyHex, nonceHex, recipientSecretKeyHex, expectedRecipientPublicKeyHex = null) {
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

  // DIAGNOSTIC: Derive our public key from the secret key and compare with expected
  const derivedPublicKey = x25519.getPublicKey(recipientSecretKey);
  const derivedPublicKeyHex = bytesToHex(derivedPublicKey);
  console.log('[POST_DECRYPT] KEY VERIFICATION:');
  console.log('  - Derived public key from our secret:', derivedPublicKeyHex);
  if (expectedRecipientPublicKeyHex) {
    console.log('  - Expected public key (from backend):', expectedRecipientPublicKeyHex);
    const keysMatch = derivedPublicKeyHex.toLowerCase() === expectedRecipientPublicKeyHex.toLowerCase();
    console.log('  - Keys match:', keysMatch ? '✓ YES' : '✗ NO - THIS IS THE PROBLEM!');
    if (!keysMatch) {
      console.error('[POST_DECRYPT] KEY MISMATCH! The secret key we have does not match the public key the backend encrypted for.');
      console.error('  - This means either:');
      console.error('    1. The stored secret key is from a different nonce/signing session');
      console.error('    2. The backend fetched the wrong public key for this user');
      console.error('    3. The user has multiple reading keys and we are using the wrong one');
    }
  }

  // DIAGNOSTIC: Test local encryption/decryption with same params to verify crypto works
  console.log('[POST_DECRYPT] LOCAL CRYPTO TEST:');
  try {
    // Create a test message
    const testMessage = new Uint8Array(32).fill(0x42); // 32 bytes of 0x42
    const testNonce = randomBytes(24);

    // Generate ephemeral keypair and compute shared secret (like server would)
    const testEphemeralSecret = x25519.utils.randomPrivateKey();
    const testEphemeralPublic = x25519.getPublicKey(testEphemeralSecret);

    // Server computes: sharedSecret = ECDH(ephemeralSecret, recipientPublic)
    const testSharedSecretServer = x25519.getSharedSecret(testEphemeralSecret, derivedPublicKey);

    // Client computes: sharedSecret = ECDH(recipientSecret, ephemeralPublic)
    const testSharedSecretClient = x25519.getSharedSecret(recipientSecretKey, testEphemeralPublic);

    const secretsMatch = bytesToHex(testSharedSecretServer) === bytesToHex(testSharedSecretClient);
    console.log('  - Local ECDH secrets match:', secretsMatch ? '✓ YES' : '✗ NO');

    // Encrypt with server's shared secret
    const testCipher = xsalsa20poly1305(testSharedSecretServer, testNonce);
    const testCiphertext = testCipher.encrypt(testMessage);

    // Decrypt with client's shared secret
    const testDecipher = xsalsa20poly1305(testSharedSecretClient, testNonce);
    const testDecrypted = testDecipher.decrypt(testCiphertext);

    const decryptedCorrectly = bytesToHex(testDecrypted) === bytesToHex(testMessage);
    console.log('  - Local encrypt/decrypt works:', decryptedCorrectly ? '✓ YES' : '✗ NO');

    if (!secretsMatch || !decryptedCorrectly) {
      console.error('[POST_DECRYPT] Local crypto test FAILED - there may be a library issue');
    }
  } catch (e) {
    console.error('[POST_DECRYPT] Local crypto test error:', e.message);
  }

  // Compute shared secret
  console.log('[POST_DECRYPT] Computing X25519 ECDH shared secret...');
  const sharedSecret = x25519.getSharedSecret(recipientSecretKey, ephemeralPublicKey);
  console.log('  - sharedSecret length:', sharedSecret.length, 'bytes');
  console.log('  - sharedSecret (full hex):', bytesToHex(sharedSecret));

  // DIAGNOSTIC: Try with reversed ephemeral public key (byte order issue?)
  const ephemeralPublicKeyReversed = new Uint8Array(ephemeralPublicKey).reverse();
  const sharedSecretReversed = x25519.getSharedSecret(recipientSecretKey, ephemeralPublicKeyReversed);
  console.log('[POST_DECRYPT] BYTE ORDER TEST (reversed ephemeral pub key):');
  console.log('  - sharedSecret (reversed):', bytesToHex(sharedSecretReversed));

  // DIAGNOSTIC: Try with HKDF-derived key (some servers do this)
  const { hkdf } = await import("@noble/hashes/hkdf");
  const { sha256 } = await import("@noble/hashes/sha256");
  const hkdfDerivedKey = hkdf(sha256, sharedSecret, new Uint8Array(0), new Uint8Array(0), 32);
  console.log('[POST_DECRYPT] HKDF TEST (if server applies HKDF to shared secret):');
  console.log('  - HKDF-derived key:', bytesToHex(hkdfDerivedKey));

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
    console.error('[POST_DECRYPT] ✗ Decryption with raw shared secret FAILED:', error.message);

    // Try with HKDF-derived key
    console.log('[POST_DECRYPT] Trying decryption with HKDF-derived key...');
    try {
      const hkdfCipher = xsalsa20poly1305(hkdfDerivedKey, nonce);
      const postKeyBytes = hkdfCipher.decrypt(encryptedKey);
      const postKeyHex = bytesToHex(postKeyBytes);

      console.log('[POST_DECRYPT] ✓ Decryption with HKDF key SUCCESS!');
      console.log('  - postKeyHex (full):', postKeyHex);
      console.log('[POST_DECRYPT] ========== decryptPostKey END ==========');
      console.warn('[POST_DECRYPT] WARNING: Server is using HKDF on shared secret. Update client code to match!');
      return postKeyHex;
    } catch (hkdfError) {
      console.error('[POST_DECRYPT] ✗ Decryption with HKDF key also FAILED:', hkdfError.message);
    }

    // Try with reversed ephemeral public key
    console.log('[POST_DECRYPT] Trying decryption with reversed ephemeral public key...');
    try {
      const reversedCipher = xsalsa20poly1305(sharedSecretReversed, nonce);
      const postKeyBytes = reversedCipher.decrypt(encryptedKey);
      const postKeyHex = bytesToHex(postKeyBytes);

      console.log('[POST_DECRYPT] ✓ Decryption with reversed key SUCCESS!');
      console.log('  - postKeyHex (full):', postKeyHex);
      console.log('[POST_DECRYPT] ========== decryptPostKey END ==========');
      console.warn('[POST_DECRYPT] WARNING: Server has byte-order issue with ephemeral public key!');
      return postKeyHex;
    } catch (reversedError) {
      console.error('[POST_DECRYPT] ✗ Decryption with reversed key also FAILED:', reversedError.message);
    }

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
