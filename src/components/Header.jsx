// File: src/components/Header.jsx
import { Show, createSignal, onMount } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import {
  connectWallet,
  walletAccount,
  walletChainId,
  isWalletAvailable,
  eagerConnect,
} from "../blockchain/wallet";
import { getChainLogo } from "../blockchain/chainLogos";
import BrandLogo from "./ui/BrandLogo.jsx"; // NEW import

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Header({ onTogglePane }) {
  const app = useApp();
  const [copyState, setCopyState] = createSignal("");
  const [eagerDone, setEagerDone] = createSignal(false);

  const desiredId = () => app.desiredChainId();
  const mismatched = () =>
    walletChainId() != null &&
    desiredId() != null &&
    walletChainId() !== desiredId();

  onMount(async () => {
    if (isWalletAvailable()) {
      await eagerConnect();
    }
    setEagerDone(true);
  });

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
      {/* Left: brand logo or title */}
      <div class="ml-2 flex items-center">
        <BrandLogo class="h-6 sm:h-7" classTitle="text-xl font-bold text-gray-900 dark:text-gray-100" />
      </div>

      {/* Right: wallet + menu */}
      <div class="flex items-center gap-2 mr-2">
        {/* Wallet area */}
        <Show
          when={walletAccount()}
          fallback={
            <Show when={eagerDone() && isWalletAvailable()}>
              <button
                class="px-3 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"
                onClick={onConnect}
                title={app.t("wallet.connect")}
                aria-label={app.t("wallet.connect")}
              >
                {app.t("wallet.connect")}
              </button>
            </Show>
          }
        >
          <div class="flex items-center gap-2">
            {/* Address pill */}
            <button
              class="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={copyAddress}
              title={app.t("wallet.copyAddress")}
              aria-label={app.t("wallet.copyAddress")}
            >
              {shortAddr(walletAccount())}
            </button>

            {/* If chain is correct → logo only; if wrong → red Change chain button */}
            <Show
              when={!mismatched()}
              fallback={
                <button
                  class="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  onClick={onSwitchChain}
                  title={app.t("wallet.changeChain")}
                  aria-label={app.t("wallet.changeChain")}
                >
                  {app.t("wallet.changeChain")}
                </button>
              }
            >
              <Show when={chainLogoSrc()}>
                <img
                  src={chainLogoSrc()}
                  alt="chain"
                  class="w-5 h-5"
                  title={app.t("wallet.onRequiredNetwork")}
                />
              </Show>
            </Show>

            {/* tiny copied hint */}
            <Show when={copyState() === "copied"}>
              <span class="text-xs text-emerald-600">{app.t("wallet.copied")}</span>
            </Show>
          </div>
        </Show>

        {/* Right menu toggle */}
        <button
          class="p-1 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
          onClick={onTogglePane}
          aria-label={app.t("menu.open")}
          title={app.t("menu.open")}
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
