// File: src/blockchain/utils.js
import { stringToBytes, bytesToHex, getAddress, formatUnits } from "viem";

/**
 * Convert string → hex bytes32 (null-padded to 32 bytes).
 */
export function toHexBytes32(str) {
  const bytes = stringToBytes(str, { size: 32 });
  return bytesToHex(bytes);
}

/**
 * EIP-55 checksum an address (throws on invalid).
 */
export function toChecksumAddress(address) {
  if (!address) return address;
  return getAddress(address);
}

/**
 * Format wei (18dp) into a compact string (e.g., 1.8K, 2.25M).
 */
export function formatRewardAmount(weiValue) {
  try {
    const numberValue = parseFloat(formatUnits(BigInt(weiValue || 0), 18));
    if (isNaN(numberValue)) return "0";
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(numberValue);
  } catch {
    return "0";
  }
}

/**
 * Split a 65-byte ECDSA signature into { r, s, v }.
 * Matches the helper used in transactions.js.
 */
export function manualSplitSignature(signature) {
  const hex = String(signature).slice(2);
  const r = `0x${hex.slice(0, 64)}`;
  const s = `0x${hex.slice(64, 128)}`;
  const v = BigInt(`0x${hex.slice(128, 130)}`);
  return { r, s, v };
}
