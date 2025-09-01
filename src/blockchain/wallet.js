// src/blockchain/wallet.js
import { createSignal } from "solid-js";

const [walletAccount, setWalletAccount] = createSignal(null);
const [walletChainId, setWalletChainId] = createSignal(null);

export function isWalletAvailable() {
  return typeof window !== "undefined" && !!window.ethereum;
}

function hexChainId(n) {
  const id = Number(n);
  if (!Number.isFinite(id)) throw new Error(`Invalid chain id: ${n}`);
  return "0x" + id.toString(16);
}

// Helper to add a timeout to a promise
function withTimeout(promise, ms, errorMessage = 'Request timed out') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

let listenersReady = false;
function setupListeners() {
  const eth = window.ethereum;
  if (!eth || listenersReady) return;
  eth.on?.("accountsChanged", (accs) => {
    setWalletAccount(accs?.[0] || null);
  });
  eth.on?.("chainChanged", (id) => {
    const n = typeof id === "string" ? parseInt(id, 16) : +id;
    setWalletChainId(Number.isFinite(n) ? n : null);
  });
  listenersReady = true;
}

export async function eagerConnect() {
  const eth = window.ethereum;
  if (!eth) return false;
  setupListeners();
  try {
    const [accounts, chainIdHex] = await Promise.all([
      eth.request({ method: "eth_accounts" }),
      eth.request({ method: "eth_chainId" }).catch(() => null),
    ]);
    if (chainIdHex) {
      const n = parseInt(chainIdHex, 16);
      setWalletChainId(Number.isFinite(n) ? n : null);
    }
    if (accounts && accounts[0]) {
      setWalletAccount(accounts[0]);
      return true;
    }
    setWalletAccount(null);
    return false;
  } catch {
    return false;
  }
}

export async function connectWallet() {
  const eth = window.ethereum;
  if (!eth) throw new Error("No Ethereum wallet found");
  setupListeners();

  const accounts = await withTimeout(
    eth.request({ method: "eth_requestAccounts" }),
    15000, // 15 second timeout
    "Wallet connection request timed out. Please try again."
  );

  const chainIdHex = await eth.request({ method: "eth_chainId" }).catch(() => null);
  if (chainIdHex) {
    const n = parseInt(chainIdHex, 16);
    setWalletChainId(Number.isFinite(n) ? n : null);
  }
  setWalletAccount(accounts?.[0] || null);
}

/**
 * Switch to a chain; if the wallet doesn't know it, try to add it.
 * meta = {
 * chainId: number,
 * name: string,
 * nativeCurrency: { name, symbol, decimals },
 * rpcUrls: string[],
 * blockExplorers?: string[]
 * }
 */
export async function switchOrAddChain(meta) {
  const eth = window.ethereum;
  if (!eth) throw new Error("No Ethereum wallet found");
  if (!meta || !meta.chainId) throw new Error("Missing chain metadata");

  const chainIdHexVal = hexChainId(meta.chainId);
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHexVal }],
    });
  } catch (e) {
    // 4902 = Unrecognized chain
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHexVal,
            chainName: meta.name || `Chain ${meta.chainId}`,
            nativeCurrency: meta.nativeCurrency || { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: meta.rpcUrls || [],
            blockExplorerUrls: meta.blockExplorers || [],
          },
        ],
      });
    } else {
      throw e;
    }
  }

  // update signal with the (new) chain id
  try {
    const cid = await eth.request({ method: "eth_chainId" });
    if (cid) {
      const n = parseInt(cid, 16);
      setWalletChainId(Number.isFinite(n) ? n : null);
    }
  } catch { /* ignore */ }
}

export { walletAccount, walletChainId };