// src/blockchain/chains.js
export const CHAINS = {
  943: {
    id: 943,
    name: "PulseChain Testnet v4",
    rpcUrls: ["https://rpc.v4.testnet.pulsechain.com"],
    nativeCurrency: { name: "tPLS", symbol: "tPLS", decimals: 18 },
    blockExplorers: [{ name: "Scan", url: "https://scan.v4.testnet.pulsechain.com" }],
  },
  369: {
    id: 369,
    name: "PulseChain",
    rpcUrls: ["https://rpc.v4.testnet.pulsechain.com"],
    nativeCurrency: { name: "tPLS", symbol: "tPLS", decimals: 18 },
    blockExplorers: [{ name: "Scan", url: "https://scan.v4.testnet.pulsechain.com" }],
  },
  // Add more chains as needed
};

export function getChainMeta(chainId) {
  return CHAINS[chainId] || null;
}
