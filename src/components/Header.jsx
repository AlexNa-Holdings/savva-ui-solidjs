// src/components/Header.jsx
import { Show, createSignal, onMount, createMemo, Switch, Match } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { connectWallet, walletAccount, walletChainId, isWalletAvailable, eagerConnect } from "../blockchain/wallet";
import { authorize } from "../blockchain/auth.js";
import { pushErrorToast } from "../ui/toast.js";
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
  const { t } = app;
  const [eagerDone, setEagerDone] = createSignal(false);
  const [isLoggingIn, setIsLoggingIn] = createSignal(false);

  const desiredId = () => app.desiredChainId();
  const mismatchedChain = () =>
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
    if (isWalletAvailable()) await eagerConnect();
    setEagerDone(true);
  });

  const handleLoginClick = async () => {
    setIsLoggingIn(true);
    try {
      await authorize(app);
    } catch (e) {
      console.error("Authorization failed:", e);
      pushErrorToast(e, { context: "Login failed" });
    } finally {
      setIsLoggingIn(false);
    }
  };

  async function onConnect() {
    try {
      await connectWallet();
      if (desiredId()) await app.ensureWalletOnDesiredChain();
    } catch (e) {
      pushErrorToast(e, { context: "Failed to connect wallet" });
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
      pushErrorToast(e, { context: "Failed to switch chain" });
    }
  }

  const chainLogoSrc = () => getChainLogo(desiredId());

  return (
    <header class="sticky top-0 z-10 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm">
      <Container>
        <div class="h-12 px-2 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <BrandLogo class="h-6 sm:h-7" classTitle="text-xl font-bold text-[hsl(var(--card-foreground))]" />
            <TokenPrice />
          </div>

          <div class="flex items-center gap-3">
            {/* Show New Post button ONLY when authorized AND wallet is connected */}
            <Show when={app.authorizedUser() && walletAccount()}>
              <NewPostButton />
            </Show>

            {/* Show user avatar menu if a session exists, regardless of wallet connection */}
            <Show when={app.authorizedUser()}>
              <AuthorizedUser />
            </Show>

            {/* Logic for Connect/Login buttons */}
            <Switch>
              {/* Wallet not connected -> Show "Connect" button */}
              <Match when={!walletAccount() && eagerDone()}>
                <Show when={isWalletAvailable()}>
                  <button class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90" onClick={onConnect}>
                    {t("wallet.connect")}
                  </button>
                </Show>
              </Match>

              {/* Wallet connected BUT no session -> Show "Login" button */}
              <Match when={walletAccount() && !app.authorizedUser()}>
                <button class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-70" onClick={handleLoginClick} disabled={isLoggingIn()}>
                  {isLoggingIn() ? t("common.checking") : "Login"}
                </button>
              </Match>
            </Switch>

            {/* Wallet address and chain info */}
            <Show when={walletAccount()}>
                <div class="flex items-center gap-2">
                    <button
                        classList={{
                            "px-2 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]": true,
                            "border-2 border-[hsl(var(--destructive))]": isAddressMismatched()
                        }}
                        onClick={copyAddress}
                        title={t("wallet.copyAddress")}
                    >
                        {shortAddr(walletAccount())}
                    </button>
                    <Show when={!mismatchedChain()} fallback={
                        <button class="px-2 py-1 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90" onClick={onSwitchChain}>
                            {t("wallet.changeChain")}
                        </button>
                    }>
                        <Show when={chainLogoSrc()}>
                            <img src={chainLogoSrc()} alt="chain" class="w-5 h-5" title={t("wallet.onRequiredNetwork")} />
                        </Show>
                    </Show>
                </div>
            </Show>

            {/* Hamburger menu */}
            <button class="p-1 rounded transition text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" onClick={onTogglePane}>
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
      </Container>
    </header>
  );
}