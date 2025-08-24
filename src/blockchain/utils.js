// src/blockchain/utils.js
import { stringToBytes, bytesToHex, getAddress, formatUnits } from "viem";

/**
 * Converts a JavaScript string into a hex-formatted bytes32 string.
 * The string is padded with null characters to 32 bytes.
 * @param {string} str The string to convert.
 * @returns {`0x${string}`} The hex-formatted bytes32 string.
 */
export function toHexBytes32(str) {
  const bytes = stringToBytes(str, { size: 32 });
  return bytesToHex(bytes);
}

/**
 * Converts an Ethereum address to its EIP-55 checksummed format.
 * Throws an error if the address is invalid.
 * @param {string} address The address to convert.
 * @returns {`0x${string}`} The checksummed address.
 */
export function toChecksumAddress(address) {
  if (!address) return address;
  return getAddress(address);
}

/**
 * Formats a large number (in wei) into a compact, human-readable string (e.g., 900, 1.8K, 2.25M).
 * @param {string | number | bigint} weiValue The value in wei.
 * @returns {string} The formatted string.
 */
export function formatRewardAmount(weiValue) {
  try {
    const numberValue = parseFloat(formatUnits(BigInt(weiValue || 0), 18));
    if (isNaN(numberValue)) return "0";

    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(numberValue);
  } catch {
    return "0";
  }
}