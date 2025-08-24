// src/blockchain/contracts.js
import { createPublicClient, http, getContract } from "viem";
import { CHAINS } from "./chains.js";

// A cache to hold instantiated viem clients per chainId.
const clientCache = new Map();

/**
 * Gets a memoized viem public client for a given chain ID.
 * @param {number} chainId - The ID of the chain.
 * @returns {import("viem").PublicClient} A viem public client instance.
 */
function getPublicClient(chainId) {
  if (clientCache.has(chainId)) {
    return clientCache.get(chainId);
  }

  const chainInfo = CHAINS[chainId];
  if (!chainInfo || !chainInfo.rpcUrls?.[0]) {
    throw new Error(`Configuration for chainId ${chainId} not found.`);
  }

  const client = createPublicClient({
    chain: chainInfo,
    transport: http(chainInfo.rpcUrls[0]),
  });

  clientCache.set(chainId, client);
  return client;
}

/**
 * Dynamically loads an ABI and creates a viem contract instance.
 * @param {object} app - The application context from useApp().
 * @param {string} contractName - The name of the contract (e.g., "Post", "Config").
 * @returns {Promise<import("viem").Contract>} A promise that resolves to a viem contract instance.
 */
export async function getSavvaContract(app, contractName) {
  const info = app.info();
  if (!info) {
    throw new Error("Backend /info not loaded yet.");
  }
  
  const chainId = info.blockchain_id;
  if (!chainId) {
    throw new Error("blockchain_id not found in /info response.");
  }

  const contractInfo = info.savva_contracts?.[contractName];
  if (!contractInfo?.address) {
    throw new Error(`Address for contract "${contractName}" not found in /info response.`);
  }

  // Dynamically import the ABI JSON file from the new folder.
  const abiModule = await import(`./abi/${contractName}.json`);
  const abi = abiModule.default;

  const publicClient = getPublicClient(chainId);

  return getContract({
    address: contractInfo.address,
    abi,
    client: publicClient,
  });
}