// src/blockchain/swappableTokens.js
// Per-chain list of tokens available for swapping.
// address "0" = native token. All other addresses must be ERC-20.

export const SWAPPABLE_TOKENS = {
  // Monad Mainnet
  143: [
    { address: "0" },  // MON (native)
    { address: "savva" },  // resolved at runtime from app.info()
    { address: "0xe7cd86e13ac4309349f30b3435a9d337750fc82d" },  // USDT0
  ],
};

/**
 * Returns the swappable token list for the current chain,
 * resolving the special "savva" placeholder to the actual contract address.
 */
export function getSwappableTokens(app) {
  const chainId = app.desiredChain()?.id;
  const list = SWAPPABLE_TOKENS[chainId];
  if (!list) return [];

  const savvaAddr = app.info()?.savva_contracts?.SavvaToken?.address;

  return list.map((t) => {
    if (t.address === "savva") {
      return savvaAddr ? { address: savvaAddr.toLowerCase() } : null;
    }
    return t;
  }).filter(Boolean);
}
