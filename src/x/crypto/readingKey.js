// src/x/crypto/readingKey.js
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { x25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

/**
 * Reading Key Infrastructure
 *
 * Allows users to generate a deterministic X25519 keypair from their wallet signature,
 * enabling encrypted messaging where only the key holder can decrypt messages.
 *
 * The scheme:
 * 1. Create a JSON structure with context, scheme, and random nonce
 * 2. Sign it as EIP-712 typed data
 * 3. Extract r||s from signature (ignoring v)
 * 4. Derive 32-byte seed using HKDF-SHA256
 * 5. Use seed as X25519 secret key (auto-clamped by library)
 * 6. Compute public key
 * 7. Publish public key, scheme, and nonce to UserProfile contract
 */

export const READING_KEY_SCHEME = "x25519-xsalsa20-poly1305";
export const READING_KEY_CONTEXT = "SAVVA Reading Key";

/**
 * Generate a random nonce for reading key generation
 * @returns {string} - Hex string representation of the nonce (10 bytes = 20 hex chars)
 */
export function generateNonce() {
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  return bytesToHex(array);
}

/**
 * Create the EIP-712 typed data structure for reading key generation
 * @param {string} nonce - Hex string nonce
 * @returns {object} - EIP-712 typed data structure
 */
export function createReadingKeyTypedData(nonce) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      ReadingKey: [
        { name: "context", type: "string" },
        { name: "scheme", type: "string" },
        { name: "nonce", type: "string" },
      ],
    },
    primaryType: "ReadingKey",
    domain: {
      name: "SAVVA",
      version: "1",
    },
    message: {
      context: READING_KEY_CONTEXT,
      scheme: READING_KEY_SCHEME,
      nonce: nonce,
    },
  };
}

/**
 * Request wallet to sign EIP-712 typed data for reading key
 * @param {string} address - User's Ethereum address
 * @param {string} nonce - Hex string nonce
 * @returns {Promise<string>} - Signature hex string
 */
export async function signReadingKeyMessage(address, nonce) {
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found");
  }

  const typedData = createReadingKeyTypedData(nonce);

  try {
    const signature = await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    });

    return signature;
  } catch (error) {
    console.error("Error signing reading key message:", error);
    throw error;
  }
}

/**
 * Parse signature into canonical r||s bytes (65 bytes → 64 bytes, ignoring v)
 * @param {string} signature - Hex signature string (0x-prefixed, 130 chars)
 * @returns {Uint8Array} - 64-byte array (r||s)
 */
export function parseSignatureToRSBytes(signature) {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;

  if (hex.length !== 130) {
    throw new Error(`Invalid signature length: expected 130 hex chars, got ${hex.length}`);
  }

  // Extract r (first 32 bytes) and s (next 32 bytes), ignore v (last byte)
  const r = hex.slice(0, 64);
  const s = hex.slice(64, 128);
  // v is hex.slice(128, 130) - we ignore it

  return hexToBytes(r + s);
}

/**
 * Derive 32-byte seed from signature using HKDF-SHA256
 * @param {Uint8Array} rsBytes - 64-byte r||s from signature
 * @param {string} nonce - Hex string nonce for domain separation
 * @returns {Uint8Array} - 32-byte derived key
 */
export function deriveKeyFromSignature(rsBytes, nonce) {
  // Use domain-separated salt and info for HKDF
  const salt = new TextEncoder().encode(`${READING_KEY_CONTEXT}:salt`);
  const info = new TextEncoder().encode(`${READING_KEY_CONTEXT}:${READING_KEY_SCHEME}:${nonce}`);

  // HKDF-SHA256: extract-and-expand
  const derivedKey = hkdf(sha256, rsBytes, salt, info, 32);

  return derivedKey;
}

/**
 * Generate X25519 keypair from derived seed
 * @param {Uint8Array} seed - 32-byte seed (will be clamped by x25519)
 * @returns {object} - { secretKey: Uint8Array, publicKey: Uint8Array }
 */
export function generateX25519KeyPair(seed) {
  if (seed.length !== 32) {
    throw new Error(`Invalid seed length: expected 32 bytes, got ${seed.length}`);
  }

  // x25519.getPublicKey will clamp the secret key automatically
  const publicKey = x25519.getPublicKey(seed);

  return {
    secretKey: seed,
    publicKey: publicKey,
  };
}

/**
 * Full reading key generation flow
 * @param {string} address - User's Ethereum address
 * @returns {Promise<object>} - { nonce, publicKey, secretKey, scheme }
 *   - nonce: hex string
 *   - publicKey: hex string (64 chars, 32 bytes)
 *   - secretKey: hex string (64 chars, 32 bytes) - KEEP PRIVATE!
 *   - scheme: string constant
 */
export async function generateReadingKey(address) {
  // Step 1: Generate random nonce
  const nonce = generateNonce();

  // Step 2: Request wallet signature on EIP-712 message
  const signature = await signReadingKeyMessage(address, nonce);

  // Step 3: Parse signature to r||s bytes
  const rsBytes = parseSignatureToRSBytes(signature);

  // Step 4: Derive 32-byte seed using HKDF-SHA256
  const seed = deriveKeyFromSignature(rsBytes, nonce);

  // Step 5 & 6: Generate X25519 keypair
  const { secretKey, publicKey } = generateX25519KeyPair(seed);

  return {
    nonce: nonce,
    publicKey: bytesToHex(publicKey),
    secretKey: bytesToHex(secretKey),
    scheme: READING_KEY_SCHEME,
  };
}

/**
 * Publish reading key public information to UserProfile contract
 * @param {object} app - Application context from useApp()
 * @param {string} publicKey - Hex string of public key
 * @param {string} nonce - Hex string of nonce
 * @returns {Promise<void>}
 */
export async function publishReadingKey(app, publicKey, nonce) {
  const { getSavvaContract } = await import("../../blockchain/contracts.js");
  const { toHexBytes32 } = await import("../../blockchain/utils.js");
  const { sendAsActor } = await import("../../blockchain/npoMulticall.js");

  const domainName = app.selectedDomainName();

  // We need to publish three values:
  // 1. reading_public_key
  // 2. reading_key_scheme
  // 3. reading_key_nonce

  // Use the new set() method to batch all three values in a single transaction
  await sendAsActor(app, {
    contractName: "UserProfile",
    functionName: "set",
    args: [
      toHexBytes32(domainName),
      // stringKeys
      [
        toHexBytes32("reading_public_key"),
        toHexBytes32("reading_key_scheme"),
        toHexBytes32("reading_key_nonce")
      ],
      // stringValues
      [
        publicKey,
        READING_KEY_SCHEME,
        nonce
      ],
      // uintKeys (empty)
      [],
      // uintValues (empty)
      []
    ],
  });
}

/**
 * Fetch reading key public information from UserProfile contract
 * @param {object} app - Application context from useApp()
 * @param {string} userAddress - User's Ethereum address
 * @param {string} [domainName] - Optional domain name (defaults to current)
 * @returns {Promise<object|null>} - { publicKey, scheme, nonce } or null if not found
 */
export async function fetchReadingKey(app, userAddress, domainName = null) {
  const { getSavvaContract } = await import("../../blockchain/contracts.js");
  const { toHexBytes32 } = await import("../../blockchain/utils.js");

  const domain = domainName || app.selectedDomainName();
  const contract = await getSavvaContract(app, "UserProfile");

  try {
    const [publicKey, scheme, nonce] = await Promise.all([
      contract.read.getString([
        userAddress,
        toHexBytes32(domain),
        toHexBytes32("reading_public_key"),
      ]),
      contract.read.getString([
        userAddress,
        toHexBytes32(domain),
        toHexBytes32("reading_key_scheme"),
      ]),
      contract.read.getString([
        userAddress,
        toHexBytes32(domain),
        toHexBytes32("reading_key_nonce"),
      ]),
    ]);

    // If any value is missing, consider the key not published
    if (!publicKey || !scheme || !nonce) {
      return null;
    }

    return {
      publicKey,
      scheme,
      nonce,
    };
  } catch (error) {
    console.error("Error fetching reading key:", error);
    return null;
  }
}

/**
 * Re-derive the secret key from a stored nonce
 * (User must sign the same message again)
 * @param {string} address - User's Ethereum address
 * @param {string} nonce - Previously used nonce
 * @returns {Promise<object>} - { secretKey: hex string, publicKey: hex string }
 */
export async function recoverReadingKey(address, nonce) {
  // Request signature with the same nonce
  const signature = await signReadingKeyMessage(address, nonce);

  // Parse and derive
  const rsBytes = parseSignatureToRSBytes(signature);
  const seed = deriveKeyFromSignature(rsBytes, nonce);
  const { secretKey, publicKey } = generateX25519KeyPair(seed);

  return {
    secretKey: bytesToHex(secretKey),
    publicKey: bytesToHex(publicKey),
  };
}
