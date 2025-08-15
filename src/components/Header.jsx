// src/components/Header.jsx
import { Show, createSignal } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import {
  connectWallet,
  walletAccount,
  walletChainId,
  isWalletAvailable,
} from "../blockchain/wallet";
import { getChainLogo } from "../blockchain/chainLogos";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Header({ onTogglePane }) {
  const app = useApp();
  const [copyState, setCopyState] = createSignal(""); // "", "copied"

  const desiredId = () => app.desiredChainId();   // number | null
  const mismatched = () =>
    walletChainId() != null &&
    desiredId() != null &&
    walletChainId() !== desiredId();

  async function onConnect() {
    try {
      await connectWallet();
      if (desiredId()) {
        try { await app.ensureWalletOnDesiredChain(); } catch {}
      }
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(walletAccount());
      setCopyState("copied");
      setTimeout(() => setCopyState(""), 1200);
    } catch {}
  }

  async function onSwitchChain() {
    try {
      await app.ensureWalletOnDesiredChain();
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  const chainLogoSrc = () => {
    const id = desiredId();
    return id ? getChainLogo(id) : null;
  };

  return (
    <header class="bg-white dark:bg-gray-800 shadow flex items-center justify-between p-2 sticky top-0 z-10 h-12">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 ml-2">
        {app.config()?.domain || "…"}
      </h1>

      <div class="flex items-center gap-2 mr-2">
        {/* Wallet area */}
        <Show
          when={walletAccount()}
          fallback={
            <button
              class="px-3 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60"
              onClick={onConnect}
              disabled={!isWalletAvailable()}
              title={isWalletAvailable() ? "Connect your wallet" : "No wallet detected"}
            >
              Connect wallet
            </button>
          }
        >
          <div class="flex items-center gap-2">
            {/* Address pill */}
            <button
              class="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={copyAddress}
              title="Click to copy address"
            >
              {shortAddr(walletAccount())}
            </button>

            {/* If chain is correct → logo only; if wrong → red Change chain button */}
            <Show when={!mismatched()} fallback={
              <button
                class="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={onSwitchChain}
                title="Switch to the required network"
              >
                Change chain
              </button>
            }>
              <Show when={chainLogoSrc()}>
                <img
                  src={chainLogoSrc()}
                  alt="chain"
                  class="w-5 h-5"
                  title="Connected to the required network"
                />
              </Show>
            </Show>

            {/* tiny copied hint */}
            <Show when={copyState() === "copied"}>
              <span class="text-xs text-emerald-600">Copied</span>
            </Show>
          </div>
        </Show>

        {/* Right menu toggle */}
        <button
          class="p-1 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
          onClick={onTogglePane}
          aria-label="Open menu"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
