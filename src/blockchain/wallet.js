// src/blockchain/wallet.js
import { createSignal } from "solid-js";

export const [walletAccount, setWalletAccount] = createSignal(null);
export const [walletChainId, setWalletChainId] = createSignal(null);
export const [walletReady, setWalletReady] = createSignal(false);

function hasProvider() {
  return typeof window !== "undefined" && window.ethereum;
}

function onAccountsChanged(accs) {
  setWalletAccount(Array.isArray(accs) && accs.length ? accs[0] : null);
}

function onChainChanged(chainHex) {
  const id = typeof chainHex === "string" ? parseInt(chainHex, 16) : Number(chainHex);
  setWalletChainId(id || null);
}

export async function connectWallet() {
  if (!hasProvider()) throw new Error("No EVM wallet found");
  const eth = window.ethereum;

  const accounts = await eth.request({ method: "eth_requestAccounts" });
  setWalletAccount(accounts?.[0] || null);

  const chainHex = await eth.request({ method: "eth_chainId" });
  setWalletChainId(parseInt(chainHex, 16));
  setWalletReady(true);

  eth.removeListener?.("accountsChanged", onAccountsChanged);
  eth.removeListener?.("chainChanged", onChainChanged);
  eth.on?.("accountsChanged", onAccountsChanged);
  eth.on?.("chainChanged", onChainChanged);
}

export function isWalletAvailable() {
  return hasProvider();
}

export async function switchOrAddChain(chainMeta) {
  if (!hasProvider()) throw new Error("No EVM wallet found");
  if (!chainMeta) throw new Error("Unknown chain");

  const eth = window.ethereum;
  const chainIdHex = "0x" + Number(chainMeta.id).toString(16);

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err) {
    if (err?.code === 4902 || /unrecognized chain/i.test(err?.message || "")) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chainIdHex,
          chainName: chainMeta.name,
          nativeCurrency: chainMeta.nativeCurrency,
          rpcUrls: chainMeta.rpcUrls,
          blockExplorerUrls: (chainMeta.blockExplorers || []).map(b => b.url),
        }],
      });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } else {
      throw err;
    }
  }
}
