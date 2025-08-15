// src/blockchain/chainLogos.js
export const CHAIN_LOGOS = {
  1: "/assets/ethereum.svg", // Ethereum Mainnet
  943: "/assets/pulsechain-test-v4.svg", // PulseChain Testnet
  369: "/assets/pulsechain.svg", // PulseChain Mainnet
  // Add more as you need
};

export function getChainLogo(chainId) {
  return CHAIN_LOGOS[chainId] || null;
}
