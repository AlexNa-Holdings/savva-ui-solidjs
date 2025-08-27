// src/components/Header.jsx
import { Show, createSignal, onMount, createMemo } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import {
  connectWallet,
  walletAccount,
  walletChainId,
  isWalletAvailable,
  eagerConnect,
} from "../blockchain/wallet";
import { getChainLogo } from "../blockchain/chainLogos";
import BrandLogo from "./ui/BrandLogo.jsx";
import Container from "./layout/Container";
import AuthorizedUser from "./auth/AuthorizedUser.jsx";
import NewPostButton from "./main/NewPostButton.jsx";
import TokenPrice from "./main/TokenPrice.jsx";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Header({ onTogglePane }) {
  const app = useApp();
  const [eagerDone, setEagerDone] = createSignal(false);

  const desiredId = () => app.desiredChainId();
  const mismatched = () =>
    walletChainId() != null &&
    desiredId() != null &&
    walletChainId() !== desiredId();

  const isAddressMismatched = createMemo(() => {
    const walletAcc = walletAccount();
    const authorizedAcc = app.authorizedUser()?.address;
    if (!authorizedAcc || !walletAcc) return false;
    return walletAcc.toLowerCase() !== authorizedAcc.toLowerCase();
  });

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
    } catch (e) {
      console.error("Failed to copy address:", e);
    }
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
    <header
      class="
        sticky top-0 z-10
        bg-[hsl(var(--background))] text-[hsl(var(--foreground))]
        shadow-sm
      "
    >
      <Container>
        <div class="h-12 px-2 flex items-center justify-between">
          {/* Left: brand */}
          <div class="flex items-center gap-4">
            <BrandLogo class="h-6 sm:h-7" classTitle="text-xl font-bold text-[hsl(var(--card-foreground))]" />
            <TokenPrice />
          </div>

          {/* Right: wallet + auth + menu */}
          <div class="flex items-center gap-3">
            <Show when={app.authorizedUser()}>
              <NewPostButton />
            </Show>
            <AuthorizedUser />
            
            <Show
              when={walletAccount()}
              fallback={
                <Show when={eagerDone() && isWalletAvailable()}>
                  <button
                    class="
                      px-3 py-1.5 text-sm rounded
                      bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
                      hover:opacity-90
                    "
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
                <button
                  classList={{
                    "px-2 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]": true,
                    "border-2 border-[hsl(var(--destructive))]": isAddressMismatched()
                  }}
                  onClick={copyAddress}
                  title={app.t("wallet.copyAddress")}
                  aria-label={app.t("wallet.copyAddress")}
                >
                  {shortAddr(walletAccount())}
                </button>

                <Show
                  when={!mismatched()}
                  fallback={
                    <button
                      class="
                        px-2 py-1 rounded
                        bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]
                        hover:opacity-90
                      "
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
              </div>
            </Show>

            <button
              class="
                p-1 rounded transition
                text-[hsl(var(--muted-foreground))]
                hover:bg-[hsl(var(--muted))]
              "
              onClick={onTogglePane}
              aria-label={app.t("menu.open")}
              title={app.t("menu.open")}
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </Container>
    </header>
  );
}