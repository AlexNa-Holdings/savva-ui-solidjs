// public/crypto-sw.js
// Service Worker for streaming decryption of encrypted media files

/**
 * Crypto Service Worker - Streaming Decryption Proxy
 *
 * This Service Worker intercepts requests to encrypted media files and
 * decrypts them chunk-by-chunk on the fly, enabling:
 * - Instant playback start (no full download needed)
 * - Seeking in videos (Range request support)
 * - Memory efficient (only decrypt what's needed)
 * - Works with <video>, <audio>, <img>, and downloads
 *
 * Architecture:
 * 1. Browser requests media: GET /ipfs/QmXXX/video.mp4
 * 2. SW intercepts, checks if it's encrypted
 * 3. SW fetches encrypted file (or range) from IPFS
 * 4. SW decrypts chunks on-the-fly
 * 5. SW streams decrypted bytes back to browser
 */

// Import TweetNaCl for decryption
// Note: In SW, we need to importScripts for external libraries
importScripts('https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js');

const CACHE_NAME = 'savva-crypto-sw-v1';
const SW_VERSION = '1.0.1';

// Chunked encryption constants (must match chunkedEncryption.js)
const CHUNK_SIZE = 256 * 1024; // 256 KB
const NONCE_SIZE = 24;
const TAG_SIZE = 16;
const HEADER_SIZE = 32;
const MAGIC = "SAVVA_EC";
const VERSION = 1;

console.log(`[Crypto SW] Service Worker ${SW_VERSION} loading...`);

/**
 * Encryption context storage
 * Maps dataCid → { postSecretKey, activeUntil }
 */
let encryptionContexts = new Map();

/**
 * Track URLs being fetched by SW to prevent re-interception
 */
let fetchingUrls = new Set();

/**
 * Helper: Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Helper: Parse chunked encryption header
 */
function parseHeader(headerBytes) {
  if (headerBytes.length < HEADER_SIZE) {
    throw new Error("Invalid header: too short");
  }

  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, HEADER_SIZE);

  // Check magic
  const decoder = new TextDecoder();
  const magic = decoder.decode(headerBytes.slice(0, 8));
  if (magic !== MAGIC) {
    throw new Error(`Invalid file format: expected ${MAGIC}, got ${magic}`);
  }

  // Parse fields
  const version = view.getUint32(8, false);
  const chunkSize = view.getUint32(12, false);
  const totalChunks = view.getUint32(16, false);
  const sizeHigh = view.getUint32(20, false);
  const sizeLow = view.getUint32(24, false);
  const originalSize = sizeHigh * 0x100000000 + sizeLow;

  return { version, chunkSize, totalChunks, originalSize };
}

/**
 * Helper: Decrypt a single chunk
 */
function decryptChunk(encryptedData, nonce, secretKey) {
  const decrypted = nacl.secretbox.open(encryptedData, nonce, secretKey);
  if (!decrypted) {
    throw new Error("Decryption failed (authentication failed)");
  }
  return decrypted;
}

/**
 * Helper: Check if data is in chunked format
 */
function isChunkedFormat(dataBytes) {
  if (dataBytes.length < 8) return false;
  const decoder = new TextDecoder();
  const magic = decoder.decode(dataBytes.slice(0, 8));
  return magic === MAGIC;
}

/**
 * Helper: Decrypt simple (old) format file
 * Format: [24-byte nonce][ciphertext with tag]
 */
function decryptSimpleFormat(encryptedData, secretKey) {
  if (encryptedData.length < NONCE_SIZE) {
    throw new Error("Invalid simple format: too short");
  }

  const nonce = encryptedData.slice(0, NONCE_SIZE);
  const ciphertext = encryptedData.slice(NONCE_SIZE);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, secretKey);
  if (!decrypted) {
    throw new Error("Decryption failed (authentication failed)");
  }

  return decrypted;
}

/**
 * Extract CID path from URL
 * https://gateway.com/ipfs/QmXXX/file.mp4 → QmXXX/file.mp4
 */
function extractCidPath(url) {
  const match = url.match(/\/ipfs\/(.+)$/);
  if (match) {
    return match[1];
  }
  // Already a CID path
  return url;
}

/**
 * Check if a URL points to an encrypted file
 */
function isEncryptedResource(url, encryptionContexts) {
  const cidPath = extractCidPath(url);

  // Skip directory listings (URLs ending with /)
  if (url.endsWith('/')) {
    return { isEncrypted: false };
  }

  // Skip __files.json (metadata file, not encrypted)
  if (url.includes('__files.json')) {
    return { isEncrypted: false };
  }

  for (const [dataCid, context] of encryptionContexts.entries()) {
    if (cidPath.startsWith(dataCid)) {
      // Check if context is still active
      if (!context.activeUntil || Date.now() < context.activeUntil) {
        return { isEncrypted: true, dataCid, secretKey: context.postSecretKey };
      }
    }
  }

  return { isEncrypted: false };
}

/**
 * Stream decrypt encrypted file with Range support
 */
async function streamDecrypt(encryptedResponse, secretKeyHex, requestRange) {
  const secretKey = hexToBytes(secretKeyHex);

  // Read first chunk to detect format
  const reader = encryptedResponse.body.getReader();
  const firstChunk = await reader.read();

  if (firstChunk.done || firstChunk.value.length < 8) {
    throw new Error("Failed to read file data");
  }

  // Check if it's chunked format or simple (old) format
  if (!isChunkedFormat(firstChunk.value)) {
    console.log("[Crypto SW] Detected simple (old) encryption format");

    // Read entire file for simple format
    const chunks = [firstChunk.value];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const encryptedFile = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      encryptedFile.set(chunk, offset);
      offset += chunk.length;
    }

    // Decrypt simple format
    const decryptedFile = decryptSimpleFormat(encryptedFile, secretKey);

    // Handle Range request
    let responseData = decryptedFile;
    let status = 200;
    let statusText = 'OK';
    const headers = new Headers();

    if (requestRange) {
      const rangeMatch = requestRange.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : decryptedFile.length - 1;

        responseData = decryptedFile.slice(start, end + 1);
        status = 206;
        statusText = 'Partial Content';

        headers.set('Content-Range', `bytes ${start}-${end}/${decryptedFile.length}`);
        headers.set('Content-Length', responseData.length.toString());
      }
    } else {
      headers.set('Content-Length', decryptedFile.length.toString());
    }

    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', 'application/octet-stream');

    return new Response(responseData, {
      status,
      statusText,
      headers
    });
  }

  // Chunked format - parse header
  console.log("[Crypto SW] Detected chunked encryption format");

  if (firstChunk.value.length < HEADER_SIZE) {
    throw new Error("Failed to read encryption header");
  }

  const header = parseHeader(firstChunk.value.slice(0, HEADER_SIZE));
  console.log(`[Crypto SW] File metadata:`, header);

  // For now, read entire encrypted file and decrypt
  // TODO: Implement true streaming with Range support
  const chunks = [firstChunk.value];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const encryptedFile = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    encryptedFile.set(chunk, offset);
    offset += chunk.length;
  }

  // Decrypt all chunks
  const decryptedFile = new Uint8Array(header.originalSize);
  let writeOffset = 0;
  let readOffset = HEADER_SIZE;

  for (let i = 0; i < header.totalChunks; i++) {
    // Calculate chunk size
    const chunkStart = i * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, header.originalSize);
    const plaintextSize = chunkEnd - chunkStart;

    // Read nonce
    const nonce = encryptedFile.slice(readOffset, readOffset + NONCE_SIZE);
    readOffset += NONCE_SIZE;

    // Read encrypted chunk
    const encryptedChunk = encryptedFile.slice(readOffset, readOffset + plaintextSize + TAG_SIZE);
    readOffset += plaintextSize + TAG_SIZE;

    // Decrypt
    const decrypted = decryptChunk(encryptedChunk, nonce, secretKey);
    decryptedFile.set(decrypted, writeOffset);
    writeOffset += decrypted.length;
  }

  // Handle Range request
  let responseData = decryptedFile;
  let status = 200;
  let statusText = 'OK';
  const headers = new Headers();

  if (requestRange) {
    // Parse range header: "bytes=start-end"
    const rangeMatch = requestRange.match(/bytes=(\d+)-(\d*)/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : header.originalSize - 1;

      responseData = decryptedFile.slice(start, end + 1);
      status = 206;
      statusText = 'Partial Content';

      headers.set('Content-Range', `bytes ${start}-${end}/${header.originalSize}`);
      headers.set('Content-Length', responseData.length.toString());
    }
  } else {
    headers.set('Content-Length', header.originalSize.toString());
  }

  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', 'application/octet-stream'); // Will be determined by browser

  return new Response(responseData, {
    status,
    statusText,
    headers
  });
}

/**
 * Message handler: Receive encryption contexts from main thread
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'SET_ENCRYPTION_CONTEXT') {
    const { dataCid, postSecretKey, ttl } = data;
    const activeUntil = ttl ? Date.now() + ttl : null;

    encryptionContexts.set(dataCid, { postSecretKey, activeUntil });
    console.log(`[Crypto SW] Set encryption context for ${dataCid}`, { activeUntil });

    event.ports[0]?.postMessage({ success: true });
  } else if (type === 'CLEAR_ENCRYPTION_CONTEXT') {
    const { dataCid } = data;
    encryptionContexts.delete(dataCid);
    console.log(`[Crypto SW] Cleared encryption context for ${dataCid}`);

    event.ports[0]?.postMessage({ success: true });
  } else if (type === 'CLEAR_ALL_CONTEXTS') {
    encryptionContexts.clear();
    console.log(`[Crypto SW] Cleared all encryption contexts`);

    event.ports[0]?.postMessage({ success: true });
  } else if (type === 'PING') {
    event.ports[0]?.postMessage({ pong: true, version: SW_VERSION });
  }
});

/**
 * Fetch handler: Intercept and decrypt encrypted media
 */
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Only intercept IPFS requests
  if (!url.includes('/ipfs/')) {
    return; // Let browser handle normally
  }

  // Skip if we're already fetching this URL (prevent re-interception)
  if (fetchingUrls.has(url)) {
    console.log(`[Crypto SW] Bypassing re-interception:`, url);
    fetchingUrls.delete(url); // Clean up immediately to allow future requests
    return; // Let it pass through
  }

  const encryptionInfo = isEncryptedResource(url, encryptionContexts);

  if (!encryptionInfo.isEncrypted) {
    return; // Not encrypted, let browser fetch normally
  }

  // Mark URL as being fetched BEFORE respondWith
  fetchingUrls.add(url);
  console.log(`[Crypto SW] Intercepting encrypted request:`, url);
  console.log(`[Crypto SW] fetchingUrls now has:`, Array.from(fetchingUrls));

  event.respondWith(
    (async () => {
      try {
        // Fetch encrypted file from network
        // Create new request with explicit options to avoid SW re-interception issues
        console.log(`[Crypto SW] About to fetch:`, event.request.url);
        console.log(`[Crypto SW] fetchingUrls before fetch:`, Array.from(fetchingUrls));

        const response = await fetch(event.request.url, {
          method: 'GET',
          mode: 'cors',
          cache: 'default',
          credentials: 'omit'
        });

        console.log(`[Crypto SW] Fetch completed with response:`, response.status, response.statusText, response.ok);
        console.log(`[Crypto SW] fetchingUrls after fetch:`, Array.from(fetchingUrls));

        if (!response.ok) {
          console.error(`[Crypto SW] Fetch failed:`, response.status, response.statusText);
          return response;
        }

        // Get Range header if present
        const rangeHeader = event.request.headers.get('Range');

        // Decrypt and stream
        return await streamDecrypt(response, encryptionInfo.secretKey, rangeHeader);
      } catch (error) {
        console.error(`[Crypto SW] Decryption failed:`, error);
        return new Response('Decryption failed', {
          status: 500,
          statusText: 'Internal Server Error'
        });
      } finally {
        // Always remove URL from fetching set when done
        fetchingUrls.delete(url);
      }
    })()
  );
});

/**
 * Install handler
 */
self.addEventListener('install', (event) => {
  console.log(`[Crypto SW] Installing version ${SW_VERSION}...`);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

/**
 * Activate handler
 */
self.addEventListener('activate', (event) => {
  console.log(`[Crypto SW] Activating version ${SW_VERSION}...`);
  // Claim all clients immediately
  event.waitUntil(self.clients.claim());
});

console.log(`[Crypto SW] Service Worker ${SW_VERSION} loaded successfully`);
