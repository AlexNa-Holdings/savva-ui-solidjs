// src/x/crypto/chunkedEncryption.js

import nacl from "tweetnacl";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

/**
 * Chunked Encryption Format for Streaming Decryption
 *
 * This format allows Service Workers to decrypt files chunk-by-chunk,
 * enabling true streaming playback without downloading the entire file.
 *
 * File Structure:
 * - Header (32 bytes): Metadata about the encrypted file
 * - Chunks: Array of encrypted chunks, each independently decryptable
 *
 * Each chunk:
 * - Nonce (24 bytes): Unique nonce for this chunk
 * - Ciphertext (variable): Encrypted data
 * - Tag (16 bytes): Authentication tag (part of XSalsa20-Poly1305)
 */

// Constants
export const CHUNK_SIZE = 256 * 1024; // 256 KB - good balance for streaming
export const NONCE_SIZE = 24; // XSalsa20 nonce size
export const TAG_SIZE = 16; // Poly1305 tag size
export const HEADER_SIZE = 32;
export const MAGIC = "SAVVA_EC"; // Magic bytes for file format identification
export const VERSION = 1;

/**
 * Create file header for chunked encrypted file
 */
function createHeader(totalChunks, originalSize) {
  const header = new Uint8Array(HEADER_SIZE);
  const view = new DataView(header.buffer);

  // Magic bytes (8 bytes)
  const encoder = new TextEncoder();
  const magic = encoder.encode(MAGIC);
  header.set(magic, 0);

  // Version (4 bytes, offset 8)
  view.setUint32(8, VERSION, false); // big-endian

  // Chunk size (4 bytes, offset 12)
  view.setUint32(12, CHUNK_SIZE, false);

  // Total chunks (4 bytes, offset 16)
  view.setUint32(16, totalChunks, false);

  // Original size (8 bytes, offset 20)
  // Split into two 32-bit values for compatibility
  const sizeHigh = Math.floor(originalSize / 0x100000000);
  const sizeLow = originalSize >>> 0;
  view.setUint32(20, sizeHigh, false);
  view.setUint32(24, sizeLow, false);

  // Reserved (4 bytes, offset 28) - for future use
  view.setUint32(28, 0, false);

  return header;
}

/**
 * Parse header from chunked encrypted file
 */
export function parseHeader(headerBytes) {
  if (headerBytes.length < HEADER_SIZE) {
    throw new Error("Invalid header: too short");
  }

  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, HEADER_SIZE);

  // Check magic bytes
  const decoder = new TextDecoder();
  const magic = decoder.decode(headerBytes.slice(0, 8));
  if (magic !== MAGIC) {
    throw new Error(`Invalid file format: expected ${MAGIC}, got ${magic}`);
  }

  // Parse version
  const version = view.getUint32(8, false);
  if (version !== VERSION) {
    throw new Error(`Unsupported version: ${version} (expected ${VERSION})`);
  }

  // Parse chunk size
  const chunkSize = view.getUint32(12, false);

  // Parse total chunks
  const totalChunks = view.getUint32(16, false);

  // Parse original size
  const sizeHigh = view.getUint32(20, false);
  const sizeLow = view.getUint32(24, false);
  const originalSize = sizeHigh * 0x100000000 + sizeLow;

  return {
    version,
    chunkSize,
    totalChunks,
    originalSize,
  };
}

/**
 * Encrypt a file in chunks
 *
 * @param {Uint8Array} plainData - Original file data
 * @param {string} secretKeyHex - 32-byte encryption key (hex)
 * @returns {Uint8Array} - Chunked encrypted file
 */
export function encryptFileChunked(plainData, secretKeyHex) {
  const secretKey = hexToBytes(secretKeyHex);
  if (secretKey.length !== 32) {
    throw new Error("Secret key must be 32 bytes");
  }

  const originalSize = plainData.length;
  const totalChunks = Math.ceil(originalSize / CHUNK_SIZE);

  console.log(`[ChunkedEncryption] Encrypting file: ${originalSize} bytes → ${totalChunks} chunks`);

  // Calculate total encrypted size
  // Header + (each chunk: nonce + ciphertext + tag)
  const encryptedSize = HEADER_SIZE + totalChunks * (NONCE_SIZE + CHUNK_SIZE + TAG_SIZE);
  const result = new Uint8Array(encryptedSize);

  // Write header
  const header = createHeader(totalChunks, originalSize);
  result.set(header, 0);

  let writeOffset = HEADER_SIZE;

  // Encrypt each chunk
  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, originalSize);
    const chunkData = plainData.slice(chunkStart, chunkEnd);

    // Generate random nonce for this chunk
    const nonce = nacl.randomBytes(NONCE_SIZE);

    // Encrypt chunk with XSalsa20-Poly1305
    const encrypted = nacl.secretbox(chunkData, nonce, secretKey);

    // Write nonce
    result.set(nonce, writeOffset);
    writeOffset += NONCE_SIZE;

    // Write encrypted data (includes tag)
    result.set(encrypted, writeOffset);
    writeOffset += encrypted.length;

    if ((i + 1) % 100 === 0 || i === totalChunks - 1) {
      console.log(`[ChunkedEncryption] Encrypted chunk ${i + 1}/${totalChunks}`);
    }
  }

  // Trim to actual size (last chunk might be smaller)
  return result.slice(0, writeOffset);
}

/**
 * Decrypt a specific chunk from chunked encrypted file
 *
 * @param {Uint8Array} encryptedFile - Complete encrypted file
 * @param {number} chunkIndex - Which chunk to decrypt (0-based)
 * @param {string} secretKeyHex - 32-byte encryption key (hex)
 * @returns {Uint8Array} - Decrypted chunk data
 */
export function decryptChunk(encryptedFile, chunkIndex, secretKeyHex) {
  const secretKey = hexToBytes(secretKeyHex);
  if (secretKey.length !== 32) {
    throw new Error("Secret key must be 32 bytes");
  }

  // Parse header
  const headerBytes = encryptedFile.slice(0, HEADER_SIZE);
  const { totalChunks, originalSize } = parseHeader(headerBytes);

  if (chunkIndex < 0 || chunkIndex >= totalChunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex} (total: ${totalChunks})`);
  }

  // Calculate chunk offset
  let offset = HEADER_SIZE;

  // Skip previous chunks
  for (let i = 0; i < chunkIndex; i++) {
    const chunkStart = i * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, originalSize);
    const plaintextSize = chunkEnd - chunkStart;
    const encryptedChunkSize = NONCE_SIZE + plaintextSize + TAG_SIZE;
    offset += encryptedChunkSize;
  }

  // Calculate this chunk's size
  const chunkStart = chunkIndex * CHUNK_SIZE;
  const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, originalSize);
  const plaintextSize = chunkEnd - chunkStart;
  const encryptedChunkSize = NONCE_SIZE + plaintextSize + TAG_SIZE;

  // Read nonce
  const nonce = encryptedFile.slice(offset, offset + NONCE_SIZE);
  offset += NONCE_SIZE;

  // Read encrypted data
  const encryptedChunk = encryptedFile.slice(offset, offset + plaintextSize + TAG_SIZE);

  // Decrypt
  const decrypted = nacl.secretbox.open(encryptedChunk, nonce, secretKey);
  if (!decrypted) {
    throw new Error(`Decryption failed for chunk ${chunkIndex} (authentication failed)`);
  }

  return decrypted;
}

/**
 * Decrypt entire chunked encrypted file
 * (For backward compatibility and small files)
 *
 * @param {Uint8Array} encryptedFile - Complete encrypted file
 * @param {string} secretKeyHex - 32-byte encryption key (hex)
 * @returns {Uint8Array} - Decrypted file data
 */
export function decryptFileChunked(encryptedFile, secretKeyHex) {
  const secretKey = hexToBytes(secretKeyHex);

  // Parse header
  const headerBytes = encryptedFile.slice(0, HEADER_SIZE);
  const { totalChunks, originalSize } = parseHeader(headerBytes);

  console.log(`[ChunkedEncryption] Decrypting file: ${totalChunks} chunks → ${originalSize} bytes`);

  const result = new Uint8Array(originalSize);
  let writeOffset = 0;

  // Decrypt each chunk
  for (let i = 0; i < totalChunks; i++) {
    const decryptedChunk = decryptChunk(encryptedFile, i, secretKeyHex);
    result.set(decryptedChunk, writeOffset);
    writeOffset += decryptedChunk.length;

    if ((i + 1) % 100 === 0 || i === totalChunks - 1) {
      console.log(`[ChunkedEncryption] Decrypted chunk ${i + 1}/${totalChunks}`);
    }
  }

  return result;
}

/**
 * Get chunk boundaries for byte range request
 *
 * @param {number} rangeStart - Start byte of requested range
 * @param {number} rangeEnd - End byte of requested range
 * @param {number} totalChunks - Total number of chunks
 * @param {number} originalSize - Original file size
 * @returns {object} - { firstChunk, lastChunk, skipBytes, takeBytes }
 */
export function getChunkRange(rangeStart, rangeEnd, totalChunks, originalSize) {
  // Determine which chunks we need
  const firstChunk = Math.floor(rangeStart / CHUNK_SIZE);
  const lastChunk = Math.floor(rangeEnd / CHUNK_SIZE);

  // Bytes to skip in first chunk
  const skipBytes = rangeStart % CHUNK_SIZE;

  // Total bytes to read
  const totalBytes = rangeEnd - rangeStart + 1;

  return {
    firstChunk,
    lastChunk,
    skipBytes,
    totalBytes,
  };
}
