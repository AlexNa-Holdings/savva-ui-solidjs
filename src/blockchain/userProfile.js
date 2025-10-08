// src/blockchain/userProfile.js
import { getSavvaContract } from "./contracts.js";

/**
 * Fetches the registered name for a given user address from the UserProfile contract.
 * @param {object} app - The app context from useApp().
 * @param {string} address - The user's wallet address.
 * @returns {Promise<string>} The registered name, or empty string if none.
 */
export async function getUserName(app, address) {
  if (!address) return "";

  try {
    const contract = await getSavvaContract(app, "UserProfile", { write: false });
    const name = await contract.read.getName([address]);
    return name || "";
  } catch (error) {
    console.error("Failed to fetch user name:", error);
    return "";
  }
}

/**
 * Fetches the avatar for a given user address from the UserProfile contract.
 * @param {object} app - The app context from useApp().
 * @param {string} address - The user's wallet address.
 * @returns {Promise<string>} The avatar string, or empty string if none.
 */
export async function getUserAvatar(app, address) {
  if (!address) return "";

  try {
    const contract = await getSavvaContract(app, "UserProfile", { write: false });
    const avatar = await contract.read.getAvatar([address]);
    return avatar || "";
  } catch (error) {
    console.error("Failed to fetch user avatar:", error);
    return "";
  }
}
