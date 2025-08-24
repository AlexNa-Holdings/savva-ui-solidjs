// src/blockchain/utils.js
import { stringToBytes, bytesToHex, getAddress } from "viem";

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