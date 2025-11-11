// src/x/preferences/storage.js

/**
 * Browser storage for user preferences (NSFW content filtering and predefined contribution amounts)
 * These settings are stored in localStorage and are device-specific
 */

// Storage keys
const NSFW_KEY = "savva.preferences.nsfw";
const AMOUNTS_KEY = "savva.preferences.predefined_amounts";

// Defaults
const DEFAULT_NSFW = "h"; // Hide
const DEFAULT_AMOUNTS = [10, 100, 500, 1000, 10000];

/**
 * Load NSFW preference from localStorage
 * @returns {string} - "s" (show), "w" (warn), or "h" (hide)
 */
export function loadNsfwPreference() {
  try {
    const stored = localStorage.getItem(NSFW_KEY);
    if (stored === "s" || stored === "w" || stored === "h") {
      return stored;
    }
  } catch (error) {
    console.warn("[Preferences] Failed to load NSFW preference:", error);
  }
  return DEFAULT_NSFW;
}

/**
 * Save NSFW preference to localStorage
 * @param {string} value - "s" (show), "w" (warn), or "h" (hide)
 */
export function saveNsfwPreference(value) {
  try {
    if (value !== "s" && value !== "w" && value !== "h") {
      console.warn("[Preferences] Invalid NSFW value:", value);
      return;
    }
    localStorage.setItem(NSFW_KEY, value);
    // Dispatch custom event so other components can react to changes
    window.dispatchEvent(new CustomEvent("savva:nsfw-changed", { detail: { value } }));
  } catch (error) {
    console.error("[Preferences] Failed to save NSFW preference:", error);
  }
}

/**
 * Listen for NSFW preference changes
 * @param {Function} callback - Called with new value when preference changes
 * @returns {Function} - Cleanup function to remove listener
 */
export function onNsfwChanged(callback) {
  const handler = (event) => callback(event.detail.value);
  window.addEventListener("savva:nsfw-changed", handler);
  return () => window.removeEventListener("savva:nsfw-changed", handler);
}

/**
 * Load predefined contribution amounts from localStorage
 * @returns {number[]} - Array of 5 amounts
 */
export function loadPredefinedAmounts() {
  try {
    const stored = localStorage.getItem(AMOUNTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 5) {
        return parsed.map(v => Number(v) || 0);
      }
    }
  } catch (error) {
    console.warn("[Preferences] Failed to load predefined amounts:", error);
  }
  return [...DEFAULT_AMOUNTS];
}

/**
 * Save predefined contribution amounts to localStorage
 * @param {number[]} amounts - Array of amounts (will be filtered to positive numbers)
 */
export function savePredefinedAmounts(amounts) {
  try {
    if (!Array.isArray(amounts)) {
      console.warn("[Preferences] Invalid amounts array:", amounts);
      return;
    }

    // Ensure we have exactly 5 amounts, filter positive numbers
    const normalized = amounts.slice(0, 5).map(a => Number(a) || 0);

    // Pad with zeros if needed
    while (normalized.length < 5) {
      normalized.push(0);
    }

    localStorage.setItem(AMOUNTS_KEY, JSON.stringify(normalized));

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent("savva:amounts-changed", {
      detail: { amounts: normalized }
    }));
  } catch (error) {
    console.error("[Preferences] Failed to save predefined amounts:", error);
  }
}

/**
 * Listen for predefined amounts changes
 * @param {Function} callback - Called with new amounts when they change
 * @returns {Function} - Cleanup function to remove listener
 */
export function onAmountsChanged(callback) {
  const handler = (event) => callback(event.detail.amounts);
  window.addEventListener("savva:amounts-changed", handler);
  return () => window.removeEventListener("savva:amounts-changed", handler);
}

/**
 * Migrate preferences from user profile (IPFS) to browser storage
 * This is a one-time migration for users who have existing settings in their profile
 * @param {object} profile - User profile object from IPFS
 * @returns {boolean} - True if migration occurred
 */
export function migrateFromProfile(profile) {
  if (!profile) return false;

  let migrated = false;

  try {
    // Migrate NSFW preference (only if not already set in localStorage)
    if (profile.nsfw && !localStorage.getItem(NSFW_KEY)) {
      const nsfwValue = profile.nsfw;
      if (nsfwValue === "s" || nsfwValue === "w" || nsfwValue === "h") {
        saveNsfwPreference(nsfwValue);
        console.log("[Preferences] Migrated NSFW preference:", nsfwValue);
        migrated = true;
      }
    }

    // Migrate predefined amounts (only if not already set in localStorage)
    if (Array.isArray(profile.sponsor_values) && !localStorage.getItem(AMOUNTS_KEY)) {
      const amounts = profile.sponsor_values.slice(0, 5).map(v => Number(v) || 0);
      if (amounts.length > 0) {
        // Pad to 5 elements if needed
        while (amounts.length < 5) {
          amounts.push(0);
        }
        savePredefinedAmounts(amounts);
        console.log("[Preferences] Migrated predefined amounts:", amounts);
        migrated = true;
      }
    }
  } catch (error) {
    console.error("[Preferences] Migration failed:", error);
  }

  return migrated;
}

/**
 * Reset all preferences to defaults
 */
export function resetPreferences() {
  try {
    saveNsfwPreference(DEFAULT_NSFW);
    savePredefinedAmounts(DEFAULT_AMOUNTS);
    console.log("[Preferences] Reset to defaults");
  } catch (error) {
    console.error("[Preferences] Failed to reset preferences:", error);
  }
}
