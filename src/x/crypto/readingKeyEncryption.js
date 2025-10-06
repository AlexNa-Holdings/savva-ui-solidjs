// src/x/crypto/readingKeyEncryption.js
import { xsalsa20poly1305 } from "@noble/ciphers/salsa";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";
import { x25519 } from "@noble/curves/ed25519";

/**
 * Encryption/Decryption utilities for Reading Keys using X25519 + XSalsa20-Poly1305
 *
 * This implements the box construction (similar to NaCl's crypto_box):
 * - Ephemeral key generation
 * - X25519 ECDH for shared secret
 * - XSalsa20-Poly1305 for authenticated encryption
 */

/**
 * Generate an ephemeral X25519 keypair
 * @returns {object} - { secretKey: Uint8Array, publicKey: Uint8Array }
 */
function generateEphemeralKeyPair() {
  const secretKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

/**
 * Compute shared secret using X25519 ECDH
 * @param {Uint8Array} secretKey - Our secret key (32 bytes)
 * @param {Uint8Array} publicKey - Their public key (32 bytes)
 * @returns {Uint8Array} - Shared secret (32 bytes)
 */
function computeSharedSecret(secretKey, publicKey) {
  return x25519.getSharedSecret(secretKey, publicKey);
}

/**
 * Encrypt a message for a recipient's public key
 * @param {string} message - Plain text message to encrypt
 * @param {string} recipientPublicKeyHex - Recipient's X25519 public key (hex)
 * @returns {object} - { ciphertext: hex string, ephemeralPublicKey: hex string, nonce: hex string }
 */
export function encryptMessage(message, recipientPublicKeyHex) {
  // Convert message to bytes
  const messageBytes = new TextEncoder().encode(message);

  // Generate ephemeral keypair for this message
  const { secretKey: ephemeralSecretKey, publicKey: ephemeralPublicKey } = generateEphemeralKeyPair();

  // Convert recipient's public key from hex
  const recipientPublicKey = hexToBytes(recipientPublicKeyHex);

  // Compute shared secret
  const sharedSecret = computeSharedSecret(ephemeralSecretKey, recipientPublicKey);

  // Generate random nonce (24 bytes for XSalsa20)
  const nonce = randomBytes(24);

  // Create cipher and encrypt
  const cipher = xsalsa20poly1305(sharedSecret, nonce);
  const ciphertext = cipher.encrypt(messageBytes);

  return {
    ciphertext: bytesToHex(ciphertext),
    ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
    nonce: bytesToHex(nonce),
  };
}

/**
 * Decrypt a message using our secret key
 * @param {string} ciphertextHex - Encrypted message (hex)
 * @param {string} ephemeralPublicKeyHex - Sender's ephemeral public key (hex)
 * @param {string} nonceHex - Nonce used for encryption (hex)
 * @param {string} recipientSecretKeyHex - Our X25519 secret key (hex)
 * @returns {string} - Decrypted plain text message
 * @throws {Error} - If decryption fails (authentication failure or invalid format)
 */
export function decryptMessage(ciphertextHex, ephemeralPublicKeyHex, nonceHex, recipientSecretKeyHex) {
  // Convert all hex inputs to bytes
  const ciphertext = hexToBytes(ciphertextHex);
  const ephemeralPublicKey = hexToBytes(ephemeralPublicKeyHex);
  const nonce = hexToBytes(nonceHex);
  const recipientSecretKey = hexToBytes(recipientSecretKeyHex);

  // Compute shared secret
  const sharedSecret = computeSharedSecret(recipientSecretKey, ephemeralPublicKey);

  // Create cipher and decrypt
  const cipher = xsalsa20poly1305(sharedSecret, nonce);

  try {
    const plaintext = cipher.decrypt(ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    throw new Error("Decryption failed: message authentication failed or invalid format");
  }
}

/**
 * Serialize encrypted message to a portable format (for storage/transmission)
 * @param {object} encryptedData - { ciphertext, ephemeralPublicKey, nonce }
 * @returns {string} - Base64-encoded JSON string
 */
export function serializeEncryptedMessage(encryptedData) {
  const json = JSON.stringify(encryptedData);
  return btoa(json);
}

/**
 * Deserialize encrypted message from portable format
 * @param {string} serialized - Base64-encoded JSON string
 * @returns {object} - { ciphertext, ephemeralPublicKey, nonce }
 */
export function deserializeEncryptedMessage(serialized) {
  try {
    const json = atob(serialized);
    return JSON.parse(json);
  } catch (error) {
    throw new Error("Invalid encrypted message format");
  }
}

/**
 * High-level API: Encrypt and serialize in one step
 * @param {string} message - Plain text message
 * @param {string} recipientPublicKeyHex - Recipient's X25519 public key (hex)
 * @returns {string} - Base64-encoded encrypted message (ready for transmission)
 */
export function encryptAndSerialize(message, recipientPublicKeyHex) {
  const encrypted = encryptMessage(message, recipientPublicKeyHex);
  return serializeEncryptedMessage(encrypted);
}

/**
 * High-level API: Deserialize and decrypt in one step
 * @param {string} serialized - Base64-encoded encrypted message
 * @param {string} recipientSecretKeyHex - Our X25519 secret key (hex)
 * @returns {string} - Decrypted plain text message
 */
export function deserializeAndDecrypt(serialized, recipientSecretKeyHex) {
  const encrypted = deserializeEncryptedMessage(serialized);
  return decryptMessage(
    encrypted.ciphertext,
    encrypted.ephemeralPublicKey,
    encrypted.nonce,
    recipientSecretKeyHex
  );
}

/**
 * Validate that a public key is valid for encryption
 * @param {string} publicKeyHex - X25519 public key (hex)
 * @returns {boolean} - True if valid
 */
export function isValidPublicKey(publicKeyHex) {
  try {
    const bytes = hexToBytes(publicKeyHex);
    return bytes.length === 32;
  } catch {
    return false;
  }
}
