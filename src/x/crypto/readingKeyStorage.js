// src/x/crypto/readingKeyStorage.js

/**
 * Browser storage management for Reading Keys
 *
 * Stores private reading keys in localStorage to enable message decryption.
 * Multiple keys can be stored per address to support key rotation (old messages
 * encrypted with old keys can still be decrypted).
 *
 * Storage format:
 * {
 *   "0xAddress": [
 *     { nonce: "...", secretKey: "...", publicKey: "...", timestamp: 1234567890 },
 *     ...
 *   ]
 * }
 */

const STORAGE_KEY = "savva_reading_keys";

/**
 * Get all stored reading keys for a specific address
 * @param {string} address - Ethereum address (will be normalized to lowercase)
 * @returns {Array} - Array of stored keys [{ nonce, secretKey, publicKey, timestamp }, ...]
 */
export function getStoredReadingKeys(address) {
  if (!address) return [];

  try {
    const normalized = address.toLowerCase();
    const allKeys = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return allKeys[normalized] || [];
  } catch (error) {
    console.error("Error reading stored reading keys:", error);
    return [];
  }
}

/**
 * Store a new reading key for an address
 * @param {string} address - Ethereum address
 * @param {object} keyData - { nonce, secretKey, publicKey }
 * @returns {boolean} - True if stored successfully
 */
export function storeReadingKey(address, keyData) {
  if (!address || !keyData || !keyData.nonce || !keyData.secretKey || !keyData.publicKey) {
    console.error("Invalid key data for storage");
    return false;
  }

  try {
    const normalized = address.toLowerCase();
    const allKeys = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    if (!allKeys[normalized]) {
      allKeys[normalized] = [];
    }

    // Check if this key (by nonce) already exists
    const existingIndex = allKeys[normalized].findIndex(k => k.nonce === keyData.nonce);

    const keyToStore = {
      nonce: keyData.nonce,
      secretKey: keyData.secretKey,
      publicKey: keyData.publicKey,
      timestamp: Date.now(),
    };

    if (existingIndex >= 0) {
      // Update existing key
      allKeys[normalized][existingIndex] = keyToStore;
    } else {
      // Add new key to the beginning (most recent first)
      allKeys[normalized].unshift(keyToStore);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allKeys));
    return true;
  } catch (error) {
    console.error("Error storing reading key:", error);
    return false;
  }
}

/**
 * Find a stored secret key by nonce
 * @param {string} address - Ethereum address
 * @param {string} nonce - The nonce to search for
 * @returns {string|null} - Secret key (hex) or null if not found
 */
export function findStoredSecretKey(address, nonce) {
  if (!address || !nonce) return null;

  const keys = getStoredReadingKeys(address);
  const found = keys.find(k => k.nonce === nonce);
  return found ? found.secretKey : null;
}

/**
 * Delete all stored reading keys for a specific address
 * @param {string} address - Ethereum address
 * @returns {boolean} - True if deleted successfully
 */
export function deleteStoredReadingKeys(address) {
  if (!address) return false;

  try {
    const normalized = address.toLowerCase();
    const allKeys = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    delete allKeys[normalized];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allKeys));
    return true;
  } catch (error) {
    console.error("Error deleting stored reading keys:", error);
    return false;
  }
}

/**
 * Delete a specific reading key by nonce
 * @param {string} address - Ethereum address
 * @param {string} nonce - The nonce of the key to delete
 * @returns {boolean} - True if deleted successfully
 */
export function deleteStoredReadingKey(address, nonce) {
  if (!address || !nonce) return false;

  try {
    const normalized = address.toLowerCase();
    const allKeys = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    if (!allKeys[normalized]) return false;

    const initialLength = allKeys[normalized].length;
    allKeys[normalized] = allKeys[normalized].filter(k => k.nonce !== nonce);

    if (allKeys[normalized].length === 0) {
      delete allKeys[normalized];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allKeys));
    return allKeys[normalized]?.length !== initialLength;
  } catch (error) {
    console.error("Error deleting specific reading key:", error);
    return false;
  }
}

/**
 * Count total number of stored keys for an address
 * @param {string} address - Ethereum address
 * @returns {number} - Number of keys stored
 */
export function countStoredReadingKeys(address) {
  return getStoredReadingKeys(address).length;
}

/**
 * Get all addresses that have stored keys
 * @returns {Array<string>} - Array of addresses
 */
export function getAllStoredAddresses() {
  try {
    const allKeys = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Object.keys(allKeys);
  } catch (error) {
    console.error("Error reading stored addresses:", error);
    return [];
  }
}

/**
 * Clear all stored reading keys (for all addresses)
 * Use with caution!
 * @returns {boolean} - True if cleared successfully
 */
export function clearAllStoredReadingKeys() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("Error clearing all reading keys:", error);
    return false;
  }
}

/**
 * Check if a key with the given nonce is already stored
 * @param {string} address - Ethereum address
 * @param {string} nonce - Nonce to check
 * @returns {boolean} - True if key is stored
 */
export function isKeyStored(address, nonce) {
  const keys = getStoredReadingKeys(address);
  return keys.some(k => k.nonce === nonce);
}

/**
 * Export all stored keys for backup (returns JSON string)
 * @returns {string} - JSON string of all stored keys
 */
export function exportStoredKeys() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "{}";
  } catch (error) {
    console.error("Error exporting stored keys:", error);
    return "{}";
  }
}

/**
 * Import stored keys from backup (overwrites existing)
 * @param {string} jsonString - JSON string of keys to import
 * @returns {boolean} - True if imported successfully
 */
export function importStoredKeys(jsonString) {
  try {
    // Validate JSON
    const parsed = JSON.parse(jsonString);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Invalid format");
    }

    localStorage.setItem(STORAGE_KEY, jsonString);
    return true;
  } catch (error) {
    console.error("Error importing stored keys:", error);
    return false;
  }
}
