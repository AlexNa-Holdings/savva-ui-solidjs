// src/x/crypto/fileEncryption.js

import { xsalsa20poly1305 } from "@noble/ciphers/salsa";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

/**
 * File Encryption Utilities
 *
 * Encrypts files (markdown, images, etc.) using the post encryption key.
 * Each file gets its own nonce, and we prepend the nonce to the encrypted data.
 *
 * Format: [24-byte nonce][encrypted data]
 */

/**
 * Encrypt a file's content using the post encryption key
 * @param {ArrayBuffer|Uint8Array} fileData - File content as bytes
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Uint8Array} - Nonce prepended to encrypted data: [nonce(24)][ciphertext]
 */
export function encryptFileData(fileData, postSecretKeyHex) {
  const dataBytes = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const secretKey = hexToBytes(postSecretKeyHex);
  const nonce = randomBytes(24);

  // Encrypt the file data
  const cipher = xsalsa20poly1305(secretKey, nonce);
  const ciphertext = cipher.encrypt(dataBytes);

  // Prepend nonce to ciphertext: [nonce][ciphertext]
  const result = new Uint8Array(24 + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, 24);

  return result;
}

/**
 * Decrypt a file's content using the post encryption key
 * @param {ArrayBuffer|Uint8Array} encryptedData - Encrypted data with nonce prepended
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Uint8Array} - Decrypted file data
 * @throws {Error} - If decryption fails (authentication failure or invalid format)
 */
export function decryptFileData(encryptedData, postSecretKeyHex) {
  const dataBytes = encryptedData instanceof Uint8Array ? encryptedData : new Uint8Array(encryptedData);

  if (dataBytes.length < 24) {
    throw new Error("Encrypted data too short - missing nonce");
  }

  // Extract nonce and ciphertext
  const nonce = dataBytes.slice(0, 24);
  const ciphertext = dataBytes.slice(24);

  const secretKey = hexToBytes(postSecretKeyHex);

  // Decrypt the file data
  const cipher = xsalsa20poly1305(secretKey, nonce);

  try {
    return cipher.decrypt(ciphertext);
  } catch (error) {
    throw new Error("File decryption failed: message authentication failed or invalid format");
  }
}

/**
 * Encrypt a File object and return a new File with encrypted content
 * @param {File} file - Original file
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Promise<File>} - New File object with encrypted content
 */
export async function encryptFile(file, postSecretKeyHex) {
  const arrayBuffer = await file.arrayBuffer();
  const encryptedData = encryptFileData(arrayBuffer, postSecretKeyHex);

  // Create new File with encrypted data
  // Keep the same name and type
  return new File([encryptedData], file.name, { type: file.type });
}

/**
 * Decrypt a File object and return a new File with decrypted content
 * @param {File} encryptedFile - Encrypted file
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Promise<File>} - New File object with decrypted content
 */
export async function decryptFile(encryptedFile, postSecretKeyHex) {
  const arrayBuffer = await encryptedFile.arrayBuffer();
  const decryptedData = decryptFileData(arrayBuffer, postSecretKeyHex);

  // Create new File with decrypted data
  return new File([decryptedData], encryptedFile.name, { type: encryptedFile.type });
}

/**
 * Encrypt file data and return as Blob
 * @param {Blob} blob - Original blob
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Promise<Blob>} - Encrypted blob
 */
export async function encryptBlob(blob, postSecretKeyHex) {
  const arrayBuffer = await blob.arrayBuffer();
  const encryptedData = encryptFileData(arrayBuffer, postSecretKeyHex);
  return new Blob([encryptedData], { type: blob.type });
}

/**
 * Decrypt blob data and return as Blob
 * @param {Blob} encryptedBlob - Encrypted blob
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Promise<Blob>} - Decrypted blob
 */
export async function decryptBlob(encryptedBlob, postSecretKeyHex) {
  const arrayBuffer = await encryptedBlob.arrayBuffer();
  const decryptedData = decryptFileData(arrayBuffer, postSecretKeyHex);
  return new Blob([decryptedData], { type: encryptedBlob.type });
}

/**
 * Encrypt text content (for markdown files)
 * @param {string} text - Plain text content
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {Uint8Array} - Encrypted data with nonce prepended
 */
export function encryptTextContent(text, postSecretKeyHex) {
  const textBytes = new TextEncoder().encode(text);
  return encryptFileData(textBytes, postSecretKeyHex);
}

/**
 * Decrypt text content (for markdown files)
 * @param {ArrayBuffer|Uint8Array} encryptedData - Encrypted data with nonce prepended
 * @param {string} postSecretKeyHex - Post's X25519 secret key (hex)
 * @returns {string} - Decrypted plain text
 */
export function decryptTextContent(encryptedData, postSecretKeyHex) {
  const decryptedBytes = decryptFileData(encryptedData, postSecretKeyHex);
  return new TextDecoder().decode(decryptedBytes);
}
