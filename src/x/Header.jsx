// src/x/Header.jsx
import { Show, createSignal, onMount, onCleanup, createMemo, For } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { connectWallet, walletAccount, walletChainId, isWalletAvailable, eagerConnect } from "../blockchain/wallet.js";
import { authorize } from "../blockchain/auth.js";
import { pushErrorToast } from "../ui/toast.js";
import { getChainLogo } from "../blockchain/chainLogos.js";
import { getChainMeta } from "../blockchain/chains.js";
import BrandLogo from "./ui/BrandLogo.jsx";
import Container from "./layout/Container.jsx";
import AuthorizedUser from "./auth/AuthorizedUser.jsx";
import NewPostButton from "./main/NewPostButton.jsx";
import TokenPrice from "./main/TokenPrice.jsx";
import ActorBadge from "./actors/ActorBadge.jsx";
import { dbg } from "../utils/debug.js";
import HeaderSearchButton from "./ui/HeaderSearchButton.jsx";
import HeaderGovernanceButton from "./ui/HeaderGovernanceButton.jsx";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import LibraryIcon from "./ui/icons/LibraryIcon.jsx";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Header({ onTogglePane, onToggleMobileNav }) {
  const app = useApp();
  const { t } = app;
  const [isLoggingIn, setIsLoggingIn] = createSignal(false);
  const [chainDropdownOpen, setChainDropdownOpen] = createSignal(false);
  const isDesktop = useMediaQuery("(min-width: 1280px)");

  const desiredId = () => app.desiredChainId();
  const configChains = createMemo(() => app.config?.()?.chains || []);
  const hasMultipleChains = createMemo(() => configChains().length > 1);
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

  onMount(() => {
    if (isWalletAvailable()) eagerConnect();
  });

  // Close chain dropdown on click outside
  function handleClickOutside(e) {
    if (chainDropdownOpen() && !e.target.closest("[data-chain-dropdown]")) {
      setChainDropdownOpen(false);
    }
  }
  onMount(() => document.addEventListener("click", handleClickOutside));
  onCleanup(() => document.removeEventListener("click", handleClickOutside));

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
    dbg.log("Header:onConnect", "Connect process started.");
    try {
      dbg.log("Header:onConnect", "Attempting to call connectWallet()...");
      await connectWallet();
      dbg.log("Header:onConnect", "connectWallet() succeeded. Account:", walletAccount());

      if (desiredId()) {
        dbg.log("Header:onConnect", "Ensuring wallet is on desired chain:", desiredId());
        await app.ensureWalletOnDesiredChain();
        dbg.log("Header:onConnect", "Chain check successful.");
      }
    } catch (e) {
      dbg.error("Header:onConnect", "Error during connection process:", e);
      const errorContext = { context: "Failed to connect wallet" };
      if (e?.message?.toLowerCase().includes("timed out")) {
        errorContext.help = t("wallet.error.timeoutHelp");
      }
      pushErrorToast(e, errorContext);
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

  async function handleChainSelect(chain) {
    setChainDropdownOpen(false);
    // Don't switch if already on this chain
    if (chain.chainId === desiredId()) {
      dbg.log("Header:handleChainSelect", "Already on chain:", chain.chainId);
      return;
    }
    dbg.log("Header:handleChainSelect", "Switching to chain:", chain);
    try {
      // Use siteDomain from default_connect.yaml (preserved during boot)
      const siteDomain = app.config?.()?.siteDomain || "";
      await app.initializeOrSwitch({
        backendLink: chain.rpc,
        domain: siteDomain,
      });
    } catch (e) {
      dbg.error("Header:handleChainSelect", "Failed to switch chain:", e);
      pushErrorToast(e, { context: "Failed to switch blockchain" });
    }
  }

  const ChainLogo = createMemo(() => getChainLogo(desiredId()));

  return (
    <header class="sticky top-0 z-40 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm">
      <Container>
        <div class="h-12 px-2 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <Show when={!isDesktop()}>
              <button
                type="button"
                class="p-1.5 rounded-full text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
                aria-label={t("nav.open")}
                title={t("nav.open")}
                onClick={onToggleMobileNav}
              >
                <LibraryIcon class="w-5 h-5" />
              </button>
            </Show>
            <BrandLogo class="h-9" classTitle="text-xl font-bold text-[hsl(var(--card-foreground))]" />
            <TokenPrice />
          </div>

          <div class="flex items-center gap-3">

            <HeaderSearchButton />
            <HeaderGovernanceButton />

            <Show when={app.authorizedUser() && walletAccount()}>
              <NewPostButton />
            </Show>

            {/* +++ actor badge lives to the left of the user menu */}
            <Show when={app.authorizedUser() && (app.npoMemberships?.()?.length ?? 0) > 0}>
              <ActorBadge />
            </Show>

            <Show when={app.authorizedUser()}>
              <AuthorizedUser />
            </Show>

            <Show
              when={walletAccount()}
              fallback={
                <Show when={isWalletAvailable()}>
                  <button
                    class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                    onClick={onConnect}
                  >
                    {t("wallet.connect")}
                  </button>
                </Show>
              }
            >
              {/* This content renders when wallet IS connected */}
              <Show when={!app.authorizedUser()}>
                <button
                  class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-70"
                  onClick={handleLoginClick}
                  disabled={isLoggingIn()}
                >
                  {isLoggingIn() ? t("common.checking") : "Login"}
                </button>
              </Show>

              <div class="flex items-center gap-2">
                <button
                  classList={{
                    "px-2 py-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] whitespace-nowrap": true,
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
                  <Show when={ChainLogo()}>
                    {(Logo) => (
                      <div class="relative" data-chain-dropdown>
                        <button
                          type="button"
                          class="flex items-center gap-1 p-1 rounded hover:bg-[hsl(var(--muted))] transition-colors"
                          title={hasMultipleChains() ? t("wallet.selectChain") : t("wallet.onRequiredNetwork")}
                          onClick={() => hasMultipleChains() && setChainDropdownOpen(!chainDropdownOpen())}
                          disabled={!hasMultipleChains()}
                        >
                          <div class="flex items-center justify-center w-6 h-6 flex-shrink-0">
                            <Logo class="w-full h-full" />
                          </div>
                          <Show when={hasMultipleChains()}>
                            <svg
                              class="w-3 h-3 text-[hsl(var(--muted-foreground))] transition-transform"
                              classList={{ "rotate-180": chainDropdownOpen() }}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </Show>
                        </button>

                        {/* Chain dropdown */}
                        <Show when={chainDropdownOpen()}>
                          <div class="absolute right-0 top-full mt-1 min-w-[180px] bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] border border-[hsl(var(--border))] rounded-md shadow-lg z-50">
                            <div class="py-1">
                              <For each={configChains()}>
                                {(chain) => {
                                  const ChainIcon = getChainLogo(chain.chainId);
                                  const chainMeta = getChainMeta(chain.chainId);
                                  const isActive = () => desiredId() === chain.chainId;
                                  return (
                                    <button
                                      type="button"
                                      class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[hsl(var(--accent))] transition-colors text-left"
                                      classList={{ "bg-[hsl(var(--accent))]": isActive() }}
                                      onClick={() => handleChainSelect(chain)}
                                    >
                                      <Show when={ChainIcon} fallback={<div class="w-5 h-5" />}>
                                        <ChainIcon class="w-5 h-5 flex-shrink-0" />
                                      </Show>
                                      <span class="truncate">{chainMeta?.name || `Chain ${chain.chainId}`}</span>
                                      <Show when={isActive()}>
                                        <svg class="w-4 h-4 ml-auto text-[hsl(var(--primary))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </Show>
                                    </button>
                                  );
                                }}
                              </For>
                            </div>
                          </div>
                        </Show>
                      </div>
                    )}
                  </Show>
                </Show>
              </div>
            </Show>

            <button
              class="p-1 rounded transition text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
              onClick={onTogglePane}
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </Container>
    </header>
  );
}