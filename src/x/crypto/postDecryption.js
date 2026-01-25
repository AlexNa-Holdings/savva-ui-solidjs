// src/x/crypto/postDecryption.js

import { decryptPostKey, decryptText } from "./postEncryption.js";
import { findStoredSecretKey, findStoredSecretKeyByPublicKey } from "./readingKeyStorage.js";
import { recoverReadingKey } from "./readingKey.js";
import { dbg } from "../../utils/debug.js";

/**
 * Post Decryption Utilities
 *
 * Handles decryption of encrypted posts by:
 * 1. Checking if we have the reading key stored
 * 2. Recovering the reading key if needed
 * 3. Decrypting the post encryption key
 * 4. Decrypting the post content fields
 */

/**
 * Get user-specific encryption data from the API response
 * The API may return user-specific data at root level (when my_addr is provided)
 * or in the recipients object (for authors/admins)
 * @param {string} userAddress - Current user's address
 * @param {object} encryptionData - Post encryption data from API
 * @returns {object|null} - User-specific encryption data or null
 */
export function getUserEncryptionData(userAddress, encryptionData) {
  if (!userAddress || !encryptionData) return null;

  // If user-specific data is at root level (API returned it directly)
  if (encryptionData.reading_key_nonce && encryptionData.pass) {
    return encryptionData;
  }

  // Otherwise, check recipients object
  if (encryptionData.recipients) {
    const normalizedAddr = userAddress.toLowerCase();
    const recipientData = encryptionData.recipients[normalizedAddr];
    if (recipientData) {
      // Merge with root-level data that might be needed
      return {
        ...recipientData,
        // Keep any root-level fields that aren't user-specific
        algorithm: encryptionData.algorithm,
        version: encryptionData.version,
      };
    }
  }

  return null;
}

/**
 * Check if user is in the recipients list for an encrypted post
 * @param {string} userAddress - Current user's address
 * @param {object} encryptionData - Post encryption data from API
 * @returns {boolean} - True if user is in recipients list
 */
export function isUserInRecipientsList(userAddress, encryptionData) {
  console.log("[isUserInRecipientsList] Checking:", { userAddress, encryptionData });

  if (!userAddress || !encryptionData) {
    console.log("[isUserInRecipientsList] Missing userAddress or encryptionData");
    return false;
  }

  // If the API returned user-specific encryption data (has reading_key_nonce at root),
  // that means the user IS in the recipients list
  if (encryptionData.reading_key_nonce) {
    console.log("[isUserInRecipientsList] User-specific data present - user is in recipients");
    return true;
  }

  // Otherwise check the full recipients object
  const recipients = encryptionData.recipients;
  console.log("[isUserInRecipientsList] Recipients:", recipients);
  console.log("[isUserInRecipientsList] Recipients type:", typeof recipients);
  console.log("[isUserInRecipientsList] Recipients keys:", recipients ? Object.keys(recipients) : 'none');

  if (!recipients || typeof recipients !== 'object') {
    console.log("[isUserInRecipientsList] No recipients or not an object");
    return false;
  }

  // Check if user's address exists in recipients object (case-insensitive)
  const normalizedAddress = userAddress.toLowerCase();
  const isInList = normalizedAddress in recipients;
  console.log("[isUserInRecipientsList] Result:", { normalizedAddress, isInList, recipientKeys: Object.keys(recipients) });
  return isInList;
}

/**
 * Check if we can decrypt a post (have the reading key stored)
 * Checks both by nonce (exact match) and by public key (same key, different nonce)
 * @param {string} userAddress - Current user's address
 * @param {object} encryptionData - Post encryption data from API
 * @returns {boolean} - True if we have the key stored
 */
export function canDecryptPost(userAddress, encryptionData) {
  console.log("[canDecryptPost] Checking:", { userAddress, encryptionData });

  if (!userAddress || !encryptionData) {
    console.log("[canDecryptPost] Missing userAddress or encryptionData");
    return false;
  }

  // Get user-specific encryption data - might be at root or in recipients object
  let userEncData = encryptionData;

  // If no reading_key_nonce at root, check if user's data is in recipients object
  if (!encryptionData.reading_key_nonce && encryptionData.recipients) {
    const normalizedAddr = userAddress.toLowerCase();
    const recipientData = encryptionData.recipients[normalizedAddr];
    if (recipientData) {
      console.log("[canDecryptPost] Found user data in recipients object:", recipientData);
      userEncData = recipientData;
    }
  }

  // First try exact match by nonce
  const readingKeyNonce = userEncData.reading_key_nonce;
  if (readingKeyNonce) {
    const secretKey = findStoredSecretKey(userAddress, readingKeyNonce);
    if (secretKey) {
      console.log("[canDecryptPost] Found stored key by nonce");
      return true;
    }
  }

  // Then try match by public key (same key used across different posts)
  const readingPublicKey = userEncData.reading_public_key;
  if (readingPublicKey) {
    const secretKey = findStoredSecretKeyByPublicKey(userAddress, readingPublicKey);
    if (secretKey) {
      console.log("[canDecryptPost] Found stored key by public key");
      return true;
    }
  }

  console.log("[canDecryptPost] No stored key found");
  return false;
}

/**
 * Get the reading key (from storage or by recovering it)
 * @param {string} userAddress - Current user's address
 * @param {string} nonce - Reading key nonce
 * @param {boolean} forceRecover - Force key recovery even if stored
 * @param {string} publicKey - Optional public key for lookup (allows using same key across posts)
 * @param {boolean} returnFullKey - If true, returns { secretKey, publicKey, nonce } object instead of just secretKey
 * @returns {Promise<string|object|null>} - Secret key (hex), full key object, or null if failed
 */
export async function getReadingSecretKey(userAddress, nonce, forceRecover = false, publicKey = null, returnFullKey = false) {
  if (!userAddress || !nonce) return null;

  console.log('[READING_KEY] ========== getReadingSecretKey START ==========');
  console.log('[READING_KEY] Parameters:');
  console.log('  - userAddress:', userAddress);
  console.log('  - nonce (from backend):', nonce);
  console.log('  - expectedPublicKey (from backend):', publicKey);
  console.log('  - forceRecover:', forceRecover);

  dbg.log("PostDecrypt", "getReadingSecretKey:start", { userAddress, nonce, forceRecover, publicKey, returnFullKey });

  // Try to find stored key first
  if (!forceRecover) {
    // First try exact match by nonce
    let storedKey = findStoredSecretKey(userAddress, nonce);
    let storedPublicKey = publicKey; // Use provided publicKey if available

    console.log('[READING_KEY] Lookup by nonce:', storedKey ? 'FOUND' : 'NOT FOUND');

    // If not found and we have a public key, try matching by public key
    if (!storedKey && publicKey) {
      storedKey = findStoredSecretKeyByPublicKey(userAddress, publicKey);
      if (storedKey) {
        console.log('[READING_KEY] Lookup by publicKey: FOUND');
      } else {
        console.log('[READING_KEY] Lookup by publicKey: NOT FOUND');
      }
    }

    if (storedKey) {
      console.log('[READING_KEY] Retrieved from storage:');
      console.log('  - address:', userAddress);
      console.log('  - secretKey (full hex):', storedKey);
      console.log('  - nonce:', nonce);
      console.log('[READING_KEY] ========== getReadingSecretKey END ==========');

      dbg.log("PostDecrypt", "getReadingSecretKey:stored-key", { userAddress, nonce });

      if (returnFullKey) {
        return { secretKey: storedKey, publicKey: storedPublicKey, nonce };
      }
      return storedKey;
    }

    // Log all stored keys for debugging
    const { getStoredReadingKeys } = await import("./readingKeyStorage.js");
    const allKeys = getStoredReadingKeys(userAddress);
    console.log('[READING_KEY] All stored keys for this address:', allKeys.map(k => ({
      nonce: k.nonce,
      publicKey: k.publicKey,
      timestamp: k.timestamp
    })));
    console.log('[READING_KEY] Expected nonce:', nonce);
    console.log('[READING_KEY] Expected publicKey:', publicKey);
  }
  dbg.log("PostDecrypt", "getReadingSecretKey:recovering", { userAddress, nonce });
  console.log('[READING_KEY] No stored key found, will recover from wallet signature...');

  // Recover the key by signing again
  try {
    const recovered = await recoverReadingKey(userAddress, nonce);

    console.log('[READING_KEY] Recovered from wallet signature:');
    console.log('  - address:', userAddress);
    console.log('  - recoveredPublicKey (full hex):', recovered.publicKey);
    console.log('  - recoveredSecretKey (full hex):', recovered.secretKey);
    console.log('  - nonce:', nonce);

    // DIAGNOSTIC: Check if recovered public key matches expected
    if (publicKey) {
      const keysMatch = recovered.publicKey.toLowerCase() === publicKey.toLowerCase();
      console.log('[READING_KEY] KEY VERIFICATION:');
      console.log('  - Recovered publicKey:', recovered.publicKey);
      console.log('  - Expected publicKey (from backend):', publicKey);
      console.log('  - Keys match:', keysMatch ? '✓ YES' : '✗ NO');
      if (!keysMatch) {
        console.error('[READING_KEY] CRITICAL: Recovered key does not match what backend expects!');
        console.error('  - This means the nonce from backend does not produce the same key.');
        console.error('  - Possible causes:');
        console.error('    1. The backend has a stale nonce from a previous reading key generation');
        console.error('    2. The user regenerated their reading key but backend has old data');
        console.error('    3. The nonce was somehow corrupted');
      }
    }
    console.log('[READING_KEY] ========== getReadingSecretKey END ==========');

    dbg.log("PostDecrypt", "getReadingSecretKey:recovered", {
      userAddress,
      nonce,
      hasSecret: !!recovered?.secretKey,
      hasPublic: !!recovered?.publicKey,
    });

    if (returnFullKey) {
      return { secretKey: recovered.secretKey, publicKey: recovered.publicKey, nonce };
    }
    return recovered.secretKey;
  } catch (error) {
    console.error("[READING_KEY] Failed to recover reading key:", error);
    console.log('[READING_KEY] ========== getReadingSecretKey END ==========');
    dbg.warn("PostDecrypt", "getReadingSecretKey:recover-failed", {
      userAddress,
      nonce,
      error: String(error?.message || error),
    });
    return null;
  }
}

/**
 * Decrypt the post encryption key for the current user
 * @param {object} encryptionData - Post encryption data for this user
 * @param {string} readingSecretKey - User's reading secret key (hex)
 * @returns {string} - Decrypted post secret key (hex)
 * @throws {Error} - If decryption fails
 */
export async function decryptPostEncryptionKey(encryptionData, readingSecretKey) {
  const { pass, pass_nonce, pass_ephemeral_pub_key, reading_public_key } = encryptionData;

  if (!pass || !pass_nonce || !pass_ephemeral_pub_key) {
    throw new Error("Missing encryption data");
  }

  dbg.log("PostDecrypt", "decryptPostEncryptionKey", {
    hasPass: !!pass,
    hasNonce: !!pass_nonce,
    hasEphemeral: !!pass_ephemeral_pub_key,
    hasReadingPublicKey: !!reading_public_key,
  });

  // Pass reading_public_key for key verification diagnostic
  return await decryptPostKey(pass, pass_ephemeral_pub_key, pass_nonce, readingSecretKey, reading_public_key);
}

/**
 * Decrypt a single locale's text fields
 * @param {object} locale - Encrypted locale object
 * @param {string} postSecretKey - Decrypted post secret key (hex)
 * @returns {object} - Decrypted locale object
 */
export function decryptLocale(locale, postSecretKey) {
  if (!locale) return null;

  console.log("[decryptLocale] Input locale:", locale);

  const decrypted = { ...locale };

  // Title is NOT encrypted - it remains public for display in post cards
  // Just pass it through as-is
  if (locale.title) {
    decrypted.title = locale.title;
  }

  // Decrypt text_preview - supports both combined "nonce:ciphertext" and separate nonce field
  if (locale.text_preview) {
    try {
      if (locale.text_preview.includes(':')) {
        // Combined format: "nonce:ciphertext"
        decrypted.text_preview = decryptText(locale.text_preview, null, postSecretKey);
      } else if (locale.text_preview_nonce) {
        // Legacy separate format
        decrypted.text_preview = decryptText(locale.text_preview, locale.text_preview_nonce, postSecretKey);
        delete decrypted.text_preview_nonce;
      } else {
        // No nonce available - likely just a placeholder hash
        console.warn("[decryptLocale] text_preview exists but no nonce - showing placeholder");
        decrypted.text_preview = "This content is encrypted for subscribers only. Click to view the full post.";
      }
    } catch (error) {
      console.error("Failed to decrypt text_preview:", error);
      decrypted.text_preview = "[Decryption Failed]";
    }
  }

  // Categories and tags are NOT encrypted - they remain public for server indexing
  // Just pass them through as-is
  if (locale.categories) {
    decrypted.categories = locale.categories;
  }

  if (locale.tags) {
    decrypted.tags = locale.tags;
  }

  // Decrypt chapter titles
  if (Array.isArray(locale.chapters)) {
    decrypted.chapters = locale.chapters.map(chapter => {
      if (chapter.title) {
        try {
          if (chapter.title.includes(':')) {
            // Combined format
            return {
              ...chapter,
              title: decryptText(chapter.title, null, postSecretKey),
            };
          } else if (chapter.title_nonce) {
            // Legacy separate format
            return {
              ...chapter,
              title: decryptText(chapter.title, chapter.title_nonce, postSecretKey),
            };
          }
        } catch (error) {
          console.error("Failed to decrypt chapter title:", error);
        }
      }
      return chapter;
    });
  }

  return decrypted;
}

/**
 * Decrypt all locales in post content
 * @param {object} content - Post content with locales
 * @param {string} postSecretKey - Decrypted post secret key (hex)
 * @returns {object} - Content with decrypted locales
 */
export function decryptPostLocales(content, postSecretKey) {
  if (!content || !content.locales) return content;

  const decrypted = { ...content };
  decrypted.locales = {};

  for (const lang in content.locales) {
    decrypted.locales[lang] = decryptLocale(content.locales[lang], postSecretKey);
  }

  return decrypted;
}

/**
 * Full post decryption workflow
 * Decrypts post metadata (title, preview, etc.) for display
 * @param {object} post - Full post object from API
 * @param {string} userAddress - Current user's address
 * @param {string|null} readingSecretKey - Optional pre-fetched reading secret key
 * @returns {Promise<object>} - Decrypted post object
 * @throws {Error} - If user doesn't have access or decryption fails
 */
export async function decryptPost(post, userAddress, readingSecretKey = null) {
  console.log('[DECRYPT_POST] ========== decryptPost START ==========');
  console.log('[DECRYPT_POST] Post CID:', post.savva_cid || post.id);
  console.log('[DECRYPT_POST] User address:', userAddress);

  const content = post.savva_content || post.content;

  if (!content || !content.encrypted) {
    // Not encrypted, return as-is
    console.log('[DECRYPT_POST] Post is not encrypted, returning as-is');
    console.log('[DECRYPT_POST] ========== decryptPost END ==========');
    return post;
  }

  // Get encryption data for this user
  const encryptionData = content.encryption;
  if (!encryptionData) {
    throw new Error("Missing encryption data");
  }

  // Get user-specific encryption data (might be at root or in recipients object)
  const userEncData = getUserEncryptionData(userAddress, encryptionData);
  if (!userEncData) {
    throw new Error("User not in recipients list");
  }

  // Log all user-specific encryption data from backend
  console.log('[DECRYPT_POST] User-specific encryption data from backend:');
  console.log('  - reading_key_nonce:', userEncData.reading_key_nonce);
  console.log('  - reading_public_key:', userEncData.reading_public_key);
  console.log('  - reading_key_scheme:', userEncData.reading_key_scheme);
  console.log('  - pass (encrypted post key):', userEncData.pass);
  console.log('  - pass_nonce:', userEncData.pass_nonce);
  console.log('  - pass_ephemeral_pub_key:', userEncData.pass_ephemeral_pub_key);

  // Get reading secret key if not provided
  let readingKey = readingSecretKey;
  if (!readingKey) {
    readingKey = await getReadingSecretKey(
      userAddress,
      userEncData.reading_key_nonce,
      false, // forceRecover
      userEncData.reading_public_key // publicKey for lookup
    );
    if (!readingKey) {
      throw new Error("Failed to get reading secret key");
    }
  }

  console.log('[DECRYPT_POST] Got reading secret key:', readingKey);

  // Decrypt the post encryption key using user-specific data
  const postSecretKey = await decryptPostEncryptionKey(userEncData, readingKey);

  // Decrypt the locales
  const decryptedContent = decryptPostLocales(content, postSecretKey);

  // Return post with decrypted content and the post secret key for image decryption
  return {
    ...post,
    savva_content: decryptedContent,
    content: decryptedContent,
    _decrypted: true, // Mark as decrypted
    _postSecretKey: postSecretKey, // Store key for decrypting images/files
  };
}

/**
 * Decrypt post metadata only (for card display)
 * This is a lighter version that only decrypts the preview fields
 * @param {object} post - Post object from API
 * @param {string} userAddress - Current user's address
 * @param {string|null} readingSecretKey - Optional pre-fetched reading secret key
 * @returns {Promise<object>} - Post with decrypted metadata
 */
export async function decryptPostMetadata(post, userAddress, readingSecretKey = null) {
  // Use the full decryption for now (metadata is part of locales)
  // In the future, we could optimize this if needed
  return decryptPost(post, userAddress, readingSecretKey);
}

/**
 * Batch decrypt multiple posts
 * @param {Array<object>} posts - Array of posts
 * @param {string} userAddress - Current user's address
 * @returns {Promise<Array<object>>} - Array of posts (decrypted where possible)
 */
export async function decryptPosts(posts, userAddress) {
  if (!posts || !Array.isArray(posts)) return posts;

  return Promise.all(
    posts.map(async (post) => {
      try {
        return await decryptPost(post, userAddress);
      } catch (error) {
        console.warn("Failed to decrypt post:", post.savva_cid || post.id, error);
        // Return original post if decryption fails
        return post;
      }
    })
  );
}
