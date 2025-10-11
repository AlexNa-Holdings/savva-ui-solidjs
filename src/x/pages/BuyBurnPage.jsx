// src/x/pages/BuyBurnPage.jsx
import { Show, onMount, createSignal, createResource, createMemo, createEffect, on } from "solid-js";
import { createPublicClient } from "viem";
import { configuredHttp } from "../../blockchain/contracts.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Spinner from "../ui/Spinner.jsx";
import { useApp } from "../../context/AppContext.jsx";
import {
  connectWallet,
  walletAccount,
  isWalletAvailable,
  eagerConnect,
} from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

export default function BuyBurnPage() {
  const app = useApp();
  const { t } = app;

  const [walletDetected, setWalletDetected] = createSignal(isWalletAvailable());
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [isTransferringGain, setIsTransferringGain] = createSignal(false);
  const [refreshKey, setRefreshKey] = createSignal(0);

  const savvaTokenAddress = createMemo(() => app.info()?.savva_contracts?.SavvaToken?.address || "");
  const baseTokenSymbol = createMemo(() => app.desiredChain()?.nativeCurrency?.symbol || "PLS");

  const statsSource = createMemo(() => {
    const info = app.info();
    const buyBurnAddr = info?.savva_contracts?.BuyBurn?.address;
    const authorsClubsAddr = info?.savva_contracts?.AuthorsClubs?.address;
    const stakingAddr = info?.savva_contracts?.Staking?.address;
    if (!buyBurnAddr || !authorsClubsAddr || !stakingAddr) return null;
    return `${buyBurnAddr}|${authorsClubsAddr}|${stakingAddr}|${refreshKey()}`;
  });

  const [stats] = createResource(statsSource, async () => {
    const [buyBurn, staking, authorsClubs] = await Promise.all([
      getSavvaContract(app, "BuyBurn"),
      getSavvaContract(app, "Staking"),
      getSavvaContract(app, "AuthorsClubs"),
    ]);

    const [baseBalance, savvaBalance, totalBurned, claimableGain] = await Promise.all([
      buyBurn.read.getBalance(),
      buyBurn.read.getSavvaBalance(),
      buyBurn.read.totalBurned(),
      staking.read.claimable([authorsClubs.address]),
    ]);

    return { baseBalance, savvaBalance, totalBurned, claimableGain };
  });

  const statsData = createMemo(() => stats() || ({
    baseBalance: 0n,
    savvaBalance: 0n,
    totalBurned: 0n,
    claimableGain: 0n,
  }));

  const claimableGain = createMemo(() => statsData().claimableGain ?? 0n);
  const hasBalanceToBurn = createMemo(
    () => (statsData().baseBalance ?? 0n) > 0n || (statsData().savvaBalance ?? 0n) > 0n,
  );

  onMount(() => {
    const available = isWalletAvailable();
    setWalletDetected(available);
    if (available) {
      eagerConnect().catch(() => {});
    }
  });

  createEffect(on(() => app.info()?.savva_contracts?.BuyBurn?.address, () => {
    setRefreshKey((value) => value + 1);
  }, { defer: true }));

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  const handleConnect = async () => {
    if (!isWalletAvailable()) {
      setWalletDetected(false);
      return;
    }
    setIsConnecting(true);
    try {
      await connectWallet();
      await app.ensureWalletOnDesiredChain?.();
      handleRefresh();
    } catch (err) {
      console.error("BuyBurnPage: connect failed", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBuyBurn = async () => {
    if (!walletAccount()) {
      await handleConnect();
      if (!walletAccount()) return;
    }

    try {
      await app.ensureWalletOnDesiredChain?.();
    } catch (err) {
      pushErrorToast(err, { context: t("buyburn.toast.error") });
      return;
    }

    const chain = app.desiredChain?.();
    if (!chain?.rpcUrls?.[0]) {
      pushToast({ type: "error", message: t("buyburn.toast.error") });
      return;
    }

    setIsProcessing(true);
    const pendingToastId = pushToast({ type: "info", message: t("buyburn.toast.pending"), autohideMs: 0 });

    try {
      const contract = await getSavvaContract(app, "BuyBurn", { write: true });
      const publicClient = createPublicClient({ chain, transport: configuredHttp(chain.rpcUrls[0]) });

      const hash = await contract.write.buyAndBurn([]);
      await publicClient.waitForTransactionReceipt({ hash });

      pushToast({ type: "success", message: t("buyburn.toast.success") });
      handleRefresh();
    } catch (err) {
      pushErrorToast(err, { context: t("buyburn.toast.error") });
    } finally {
      app.dismissToast?.(pendingToastId);
      setIsProcessing(false);
    }
  };

  const handleTransferGain = async () => {
    if (claimableGain() <= 0n) return;

    if (!walletAccount()) {
      await handleConnect();
      if (!walletAccount()) return;
    }

    try {
      await app.ensureWalletOnDesiredChain?.();
    } catch (err) {
      pushErrorToast(err, { context: t("buyburn.toast.transferError") });
      return;
    }

    const chain = app.desiredChain?.();
    if (!chain?.rpcUrls?.[0]) {
      pushToast({ type: "error", message: t("buyburn.toast.transferError") });
      return;
    }

    setIsTransferringGain(true);
    const pendingToastId = pushToast({ type: "info", message: t("buyburn.toast.transferPending"), autohideMs: 0 });

    try {
      const authorsClubs = await getSavvaContract(app, "AuthorsClubs", { write: true });
      const publicClient = createPublicClient({ chain, transport: configuredHttp(chain.rpcUrls[0]) });

      const hash = await authorsClubs.write.claimStakingGain([]);
      await publicClient.waitForTransactionReceipt({ hash });

      pushToast({ type: "success", message: t("buyburn.toast.transferSuccess") });
      handleRefresh();
    } catch (err) {
      pushErrorToast(err, { context: t("buyburn.toast.transferError") });
    } finally {
      app.dismissToast?.(pendingToastId);
      setIsTransferringGain(false);
    }
  };

  return (
    <main class="p-4 max-w-4xl mx-auto space-y-4">
      <ClosePageButton />

      <header class="space-y-2">
        <h1 class="text-2xl font-semibold text-[hsl(var(--card-foreground))]">
          {t("buyburn.title")}
        </h1>
        <p class="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
          {t("buyburn.description")}
        </p>
      </header>

      <Show
        when={walletDetected()}
        fallback={
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center p-6 space-y-3">
            <h2 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
              {t("buyburn.installTitle")}
            </h2>
            <p class="text-sm text-[hsl(var(--muted-foreground))]">
              {t("buyburn.installDescription")}
            </p>
          </section>
        }
      >
        <Show
          when={walletAccount()}
          fallback={
            <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center p-6 space-y-3">
              <h2 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
                {t("buyburn.connectTitle")}
              </h2>
              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                {t("wallet.connectPrompt")}
              </p>
              <button
                type="button"
                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConnect}
                disabled={isConnecting()}
              >
                {isConnecting() ? t("common.working") : t("wallet.connect")}
              </button>
            </section>
          }
        >
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-6 text-left">
            <div class="space-y-2">
              <h2 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
                {t("buyburn.readyTitle")}
              </h2>
              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                {t("buyburn.readyDescription")}
              </p>
            </div>

            <Show when={stats.loading}>
              <div class="flex items-center justify-center py-6">
                <Spinner class="w-6 h-6" />
              </div>
            </Show>

            <Show when={stats.error}>
              <div class="space-y-3">
                <p class="text-sm text-[hsl(var(--muted-foreground))]">
                  {t("buyburn.error.load")}
                </p>
                <button
                  type="button"
                  class="self-start px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                  onClick={handleRefresh}
                >
                  {t("buyburn.actions.retry")}
                </button>
              </div>
            </Show>

            <Show when={!stats.loading && !stats.error}>
              <div class="space-y-6">
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] p-4 space-y-2">
                    <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {t("buyburn.stats.baseLabel", { symbol: baseTokenSymbol() })}
                    </div>
                    <TokenValue amount={statsData().baseBalance} tokenAddress="0" />
                  </div>

                  <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] p-4 space-y-2">
                    <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {t("buyburn.stats.savvaLabel")}
                    </div>
                    <TokenValue amount={statsData().savvaBalance} tokenAddress={savvaTokenAddress() || undefined} />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    class="w-full px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleBuyBurn}
                    disabled={
                      isProcessing() || stats.loading || !walletAccount() || !hasBalanceToBurn()
                    }
                  >
                    {isProcessing() ? t("common.working") : t("buyburn.actions.buy")}
                  </button>
                </div>

                <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] p-4 space-y-4">
                  <div class="space-y-2">
                    <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {t("buyburn.subscriptions.title")}
                    </div>
                    <p class="text-sm text-[hsl(var(--muted-foreground))]">
                      {t("buyburn.subscriptions.description")}
                    </p>
                  </div>

                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="space-y-1">
                      <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        {t("buyburn.stats.gainLabel")}
                      </div>
                      <TokenValue
                        amount={claimableGain()}
                        tokenAddress={savvaTokenAddress() || undefined}
                        class="text-lg"
                      />
                    </div>
                    <button
                      type="button"
                      class="w-full sm:w-auto px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleTransferGain}
                      disabled={isTransferringGain() || claimableGain() <= 0n || stats.loading}
                    >
                      {isTransferringGain() ? t("common.working") : t("buyburn.actions.transferGain")}
                    </button>
                  </div>
                </div>

                <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] p-4 space-y-2">
                  <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    {t("buyburn.stats.totalBurned")}
                  </div>
                  <TokenValue amount={statsData().totalBurned} tokenAddress={savvaTokenAddress() || undefined} />
                </div>
              </div>
            </Show>
          </section>
        </Show>
      </Show>
    </main>
  );
}
