// src/ipfs/encryptedFetch.js

import { ipfs } from "./index.js";
import { decryptFileData } from "../x/crypto/fileEncryption.js";

/**
 * Global state for tracking the currently viewed encrypted post
 * This is set by PostPage when viewing an encrypted post
 */
let currentEncryptedPostContext = null;

/**
 * Set the current encrypted post context for automatic decryption
 * @param {object} context - { dataCid: string, postSecretKey: string } or null
 */
export function setEncryptedPostContext(context) {
  currentEncryptedPostContext = context;
}

/**
 * Get the current encrypted post context
 * @returns {object|null}
 */
export function getEncryptedPostContext() {
  return currentEncryptedPostContext;
}

/**
 * Clear the encrypted post context
 */
export function clearEncryptedPostContext() {
  currentEncryptedPostContext = null;
}

/**
 * Check if a given CID path belongs to the currently viewed encrypted post
 * @param {string} cidPath - IPFS path like "QmXXX/file.jpg"
 * @returns {boolean}
 */
function isFromEncryptedPost(cidPath) {
  if (!currentEncryptedPostContext || !currentEncryptedPostContext.dataCid) {
    return false;
  }

  const normalizedPath = ipfs.normalizeInput(cidPath);
  const normalizedDataCid = ipfs.normalizeInput(currentEncryptedPostContext.dataCid);

  // Check if the path starts with the data CID
  return normalizedPath.startsWith(normalizedDataCid);
}

/**
 * Enhanced IPFS fetch that automatically decrypts encrypted content
 * Drop-in replacement for ipfs.fetchBest()
 *
 * @param {object} app - App context
 * @param {string} ipfsPath - IPFS path to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<{res: Response, url: string, gateway: string, decrypted: boolean}>}
 */
export async function fetchBestWithDecryption(app, ipfsPath, options = {}) {
  console.log("[encryptedFetch] fetchBestWithDecryption called", {
    ipfsPath,
    hasContext: !!currentEncryptedPostContext,
    contextDataCid: currentEncryptedPostContext?.dataCid,
    hasKey: !!currentEncryptedPostContext?.postSecretKey,
  });

  // First, fetch the content normally
  const result = await ipfs.fetchBest(app, ipfsPath, options);

  // Check if this is from an encrypted post
  if (!isFromEncryptedPost(ipfsPath)) {
    console.log("[encryptedFetch] Not from encrypted post, returning as-is");
    return { ...result, decrypted: false };
  }

  const postSecretKey = currentEncryptedPostContext.postSecretKey;
  if (!postSecretKey) {
    console.warn("[encryptedFetch] Path is from encrypted post but no decryption key available");
    return { ...result, decrypted: false };
  }

  console.log("[encryptedFetch] Will attempt decryption for", ipfsPath);

  // NOTE: We used to check for Service Worker and assume it decrypted the content.
  // However, this caused race conditions where content was fetched before the SW
  // received the encryption context. Now we ALWAYS do client-side decryption
  // when we have the postSecretKey context set. The SW may have also decrypted,
  // but the second decryption will fail gracefully and we'll return the original.

  // Service Worker not available - use blob-based fallback decryption
  // Get the encrypted data as ArrayBuffer
  const encryptedData = await result.res.arrayBuffer();

  try {
    console.log("[encryptedFetch] Encrypted data size:", encryptedData.byteLength, "bytes");

    // Decrypt the data
    const decryptedData = decryptFileData(encryptedData, postSecretKey);

    console.log("[encryptedFetch] Decryption successful, decrypted size:", decryptedData.byteLength, "bytes");

    // Create a new Response with decrypted data
    const decryptedBlob = new Blob([decryptedData]);
    const decryptedResponse = new Response(decryptedBlob, {
      status: 200,
      statusText: "OK",
      headers: result.res.headers,
    });

    return {
      ...result,
      res: decryptedResponse,
      decrypted: true,
    };
  } catch (error) {
    console.error("[encryptedFetch] Failed to decrypt content:", error);
    console.error("[encryptedFetch] Encrypted data first 100 bytes (hex):",
      Array.from(new Uint8Array(encryptedData.slice(0, 100)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
    );
    // Recreate response from the encrypted data since we already consumed it
    const encryptedBlob = new Blob([encryptedData]);
    const fallbackResponse = new Response(encryptedBlob, {
      status: 200,
      statusText: "OK",
      headers: result.res.headers,
    });
    return { ...result, res: fallbackResponse, decrypted: false };
  }
}

/**
 * Enhanced getJSONBest that automatically decrypts encrypted JSON
 * Drop-in replacement for ipfs.getJSONBest()
 */
export async function getJSONBestWithDecryption(app, ipfsPath, options = {}) {
  const result = await fetchBestWithDecryption(app, ipfsPath, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });

  const data = await result.res.json();

  return {
    data,
    url: result.url,
    gateway: result.gateway,
    decrypted: result.decrypted,
  };
}

/**
 * Create a decrypted object URL for binary content (images, videos, etc.)
 * This is useful for components that need a URL to display encrypted content
 *
 * @param {ArrayBuffer} encryptedData - Encrypted file data
 * @param {string} postSecretKey - Post encryption key (hex)
 * @param {string} mimeType - MIME type for the Blob (optional)
 * @returns {string} - Object URL that can be used in <img src> etc.
 */
export function createDecryptedObjectURL(encryptedData, postSecretKey, mimeType = null) {
  const decryptedData = decryptFileData(encryptedData, postSecretKey);
  const blob = new Blob([decryptedData], mimeType ? { type: mimeType } : undefined);
  return URL.createObjectURL(blob);
}
