// src/blockchain/chains.js
export const CHAINS = {
  943: {
    id: 943,
    chainId: 943, // required by wallet.js
    name: "PulseChain Testnet v4",
    rpcUrls: ["https://rpc.v4.testnet.pulsechain.com"],
    nativeCurrency: { name: "Test Pulse", symbol: "tPLS", decimals: 18 },
    blockExplorers: ["https://scan.v4.testnet.pulsechain.com"],
  },
  369: {
    id: 369,
    chainId: 369, // required by wallet.js
    name: "PulseChain",
    rpcUrls: ["https://rpc.pulsechain.com"],
    nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
    blockExplorers: ["https://scan.pulsechain.com"],
  },
};

export function getChainMeta(chainId) {
  const raw = CHAINS[chainId];
  if (!raw) return null;

  const chainIdNum = raw.chainId ?? raw.id ?? Number(chainId);
  const rpcUrls = Array.isArray(raw.rpcUrls)
    ? raw.rpcUrls
    : raw.rpcUrls ? [raw.rpcUrls] : [];

  let explorers = [];
  if (Array.isArray(raw.blockExplorers)) {
    explorers = raw.blockExplorers
      .map((x) => (typeof x === "string" ? x : x?.url))
      .filter(Boolean);
  } else if (Array.isArray(raw.blockExplorerUrls)) {
    explorers = raw.blockExplorerUrls.filter(Boolean);
  }

  return {
    id: chainIdNum, // This is the required property for viem
    chainId: chainIdNum,
    name: raw.name,
    nativeCurrency: raw.nativeCurrency,
    rpcUrls,
    blockExplorers: explorers,
  };
}