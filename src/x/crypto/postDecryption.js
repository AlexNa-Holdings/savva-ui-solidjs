// src/x/crypto/postDecryption.js

import { decryptPostKey, decryptText } from "./postEncryption.js";
import { findStoredSecretKey } from "./readingKeyStorage.js";
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
 * Check if we can decrypt a post (have the reading key stored)
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

  const readingKeyNonce = encryptionData.reading_key_nonce;
  console.log("[canDecryptPost] Reading key nonce:", readingKeyNonce);

  if (!readingKeyNonce) {
    console.log("[canDecryptPost] No reading_key_nonce in encryptionData");
    return false;
  }

  const secretKey = findStoredSecretKey(userAddress, readingKeyNonce);
  console.log("[canDecryptPost] Found stored key?", !!secretKey);

  return !!secretKey;
}

/**
 * Get the reading secret key (from storage or by recovering it)
 * @param {string} userAddress - Current user's address
 * @param {string} nonce - Reading key nonce
 * @param {boolean} forceRecover - Force key recovery even if stored
 * @returns {Promise<string|null>} - Secret key (hex) or null if failed
 */
export async function getReadingSecretKey(userAddress, nonce, forceRecover = false) {
  if (!userAddress || !nonce) return null;

  dbg.log("PostDecrypt", "getReadingSecretKey:start", { userAddress, nonce, forceRecover });

  // Try to find stored key first
  if (!forceRecover) {
    const storedKey = findStoredSecretKey(userAddress, nonce);
    if (storedKey) {
      dbg.log("PostDecrypt", "getReadingSecretKey:stored-key", { userAddress, nonce });
      return storedKey;
    }
  }
  dbg.log("PostDecrypt", "getReadingSecretKey:recovering", { userAddress, nonce });

  // Recover the key by signing again
  try {
    const recovered = await recoverReadingKey(userAddress, nonce);
    dbg.log("PostDecrypt", "getReadingSecretKey:recovered", {
      userAddress,
      nonce,
      hasSecret: !!recovered?.secretKey,
    });
    return recovered.secretKey;
  } catch (error) {
    console.error("Failed to recover reading key:", error);
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
export function decryptPostEncryptionKey(encryptionData, readingSecretKey) {
  const { pass, pass_nonce, pass_ephemeral_pub_key } = encryptionData;

  if (!pass || !pass_nonce || !pass_ephemeral_pub_key) {
    throw new Error("Missing encryption data");
  }

  dbg.log("PostDecrypt", "decryptPostEncryptionKey", {
    hasPass: !!pass,
    hasNonce: !!pass_nonce,
    hasEphemeral: !!pass_ephemeral_pub_key,
  });

  return decryptPostKey(pass, pass_ephemeral_pub_key, pass_nonce, readingSecretKey);
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
  console.log("[decryptLocale] Title format:", locale.title);
  console.log("[decryptLocale] Has ':' separator?", locale.title?.includes(':'));

  const decrypted = { ...locale };

  // Decrypt title - supports both combined "nonce:ciphertext" and separate nonce field
  if (locale.title) {
    try {
      if (locale.title.includes(':')) {
        // Combined format: "nonce:ciphertext"
        decrypted.title = decryptText(locale.title, null, postSecretKey);
      } else if (locale.title_nonce) {
        // Legacy separate format
        decrypted.title = decryptText(locale.title, locale.title_nonce, postSecretKey);
        delete decrypted.title_nonce;
      } else {
        // No nonce available - likely just a placeholder hash
        console.warn("[decryptLocale] Title exists but no nonce - showing placeholder");
        decrypted.title = "[Encrypted Content]";
      }
    } catch (error) {
      console.error("Failed to decrypt title:", error);
      decrypted.title = "[Decryption Failed]";
    }
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

  // Decrypt categories
  if (locale.categories) {
    try {
      let categoriesJson;
      if (typeof locale.categories === 'string') {
        // Encrypted - either combined or separate format
        if (locale.categories.includes(':')) {
          categoriesJson = decryptText(locale.categories, null, postSecretKey);
        } else if (locale.categories_nonce) {
          categoriesJson = decryptText(locale.categories, locale.categories_nonce, postSecretKey);
          delete decrypted.categories_nonce;
        } else {
          // Not encrypted or placeholder
          categoriesJson = locale.categories;
        }
        decrypted.categories = JSON.parse(categoriesJson);
      } else if (Array.isArray(locale.categories)) {
        // Already decrypted or plain array
        decrypted.categories = locale.categories;
      }
    } catch (error) {
      console.error("Failed to decrypt categories:", error);
      decrypted.categories = [];
    }
  }

  // Decrypt tags
  if (locale.tags) {
    try {
      let tagsJson;
      if (typeof locale.tags === 'string') {
        // Encrypted - either combined or separate format
        if (locale.tags.includes(':')) {
          tagsJson = decryptText(locale.tags, null, postSecretKey);
        } else if (locale.tags_nonce) {
          tagsJson = decryptText(locale.tags, locale.tags_nonce, postSecretKey);
          delete decrypted.tags_nonce;
        } else {
          // Not encrypted or placeholder
          tagsJson = locale.tags;
        }
        decrypted.tags = JSON.parse(tagsJson);
      } else if (Array.isArray(locale.tags)) {
        // Already decrypted or plain array
        decrypted.tags = locale.tags;
      }
    } catch (error) {
      console.error("Failed to decrypt tags:", error);
      decrypted.tags = [];
    }
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
  const content = post.savva_content || post.content;

  if (!content || !content.encrypted) {
    // Not encrypted, return as-is
    return post;
  }

  // Get encryption data for this user
  const encryptionData = content.encryption;
  if (!encryptionData) {
    throw new Error("Missing encryption data");
  }

  // Get reading secret key if not provided
  let readingKey = readingSecretKey;
  if (!readingKey) {
    readingKey = await getReadingSecretKey(userAddress, encryptionData.reading_key_nonce);
    if (!readingKey) {
      throw new Error("Failed to get reading secret key");
    }
  }

  // Decrypt the post encryption key
  const postSecretKey = decryptPostEncryptionKey(encryptionData, readingKey);

  // Decrypt the locales
  const decryptedContent = decryptPostLocales(content, postSecretKey);

  // Return post with decrypted content
  return {
    ...post,
    savva_content: decryptedContent,
    content: decryptedContent,
    _decrypted: true, // Mark as decrypted
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
