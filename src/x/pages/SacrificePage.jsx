// src/x/pages/SacrificePage.jsx
import {
  Show,
  onMount,
  onCleanup,
  createSignal,
  createResource,
  createMemo,
  createEffect,
} from "solid-js";
import { formatUnits } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Countdown from "../ui/Countdown.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import {
  connectWallet,
  walletAccount,
  isWalletAvailable,
  eagerConnect,
} from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { toHexBytes32 } from "../../blockchain/utils.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

const STAKING_SHARE = 50n;

function trimAmountString(value) {
  if (!value) return "0";
  const str = String(value);
  if (!str.includes(".")) return str;
  return str.replace(/\.?0+$/, "") || "0";
}

function StatCard(props) {
  return (
    <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-1">
      <Show when={props.label}>
        <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {props.label}
        </div>
      </Show>
      <div class="text-lg font-semibold text-[hsl(var(--card-foreground))] space-y-1">
        {props.children}
      </div>
      <Show when={props.hint}>
        <div class="text-xs text-[hsl(var(--muted-foreground))]">{props.hint}</div>
      </Show>
    </div>
  );
}

function ClaimSummary(props) {
  const claimable = () => props.claimableAmount();
  const isClaiming = props.isClaiming;
  const { t } = props;

  return (
    <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.1)] p-4 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {t("sacrifice.stats.claimable")}
          </div>
          <div class="text-sm text-[hsl(var(--card-foreground))]">
            <TokenValue amount={claimable()} tokenAddress={props.savvaTokenAddress || ""} />
          </div>
          <Show when={claimable() > 0n}>
            <div class="text-xs text-[hsl(var(--muted-foreground))]">
              {t("sacrifice.claimReady")}
            </div>
          </Show>
        </div>
        <button
          type="button"
          class="px-3 py-1.5 text-xs rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={props.onClaim}
          disabled={isClaiming() || claimable() <= 0n}
        >
          <Show when={!isClaiming()} fallback={t("sacrifice.actions.claiming")}>
            {t("sacrifice.actions.claim")}
          </Show>
        </button>
      </div>
    </div>
  );
}

function DepositPreviewCard(props) {
  const preview = () => props.preview();
  const { t } = props;

  return (
    <div class="border border-[hsl(var(--border))] border-l-[hsl(var(--primary))] border-l-2 bg-[hsl(var(--accent)/0.1)] px-4 pb-4 pt-0 space-y-3 h-fit">
      <div class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
        {t("sacrifice.preview.title")}
      </div>

      <Show
        when={preview()}
        fallback={<div class="text-xs text-[hsl(var(--muted-foreground))]">{t("sacrifice.preview.enterAmount")}</div>}
      >
        <Show
          when={preview()?.hasContext ?? false}
          fallback={<div class="text-xs text-[hsl(var(--muted-foreground))]">{t("sacrifice.preview.enterAmount")}</div>}
        >
          <div class="space-y-3 text-sm">
            <div class="flex items-start justify-between gap-3">
              <span class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {t("sacrifice.preview.totalAfter")}
              </span>
              <TokenValue amount={preview().totalAfterWei} tokenAddress="0" format="vertical" />
            </div>
            <div class="flex items-start justify-between gap-3">
              <span class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {t("sacrifice.preview.yourAfter")}
              </span>
              <TokenValue amount={preview().userAfterWei} tokenAddress="0" format="vertical" />
            </div>
            <div class="flex items-start justify-between gap-3">
              <span class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {t("sacrifice.preview.expectedSavva")}
              </span>
              <TokenValue amount={preview().expectedSavvaWei} tokenAddress={props.savvaTokenAddress} format="vertical" />
            </div>
            <div class="flex flex-col gap-2">
              <span class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {t("sacrifice.preview.price")}
              </span>
              <span class="tabular-nums">
                {t("sacrifice.tokenPriceLine", {
                  base: preview().newPriceBase.toLocaleString(undefined, {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6,
                  }),
                  symbol: props.baseSymbol,
                  usd: preview().newPriceUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6,
                  }),
                })}
              </span>
              <span class="text-xs text-[hsl(var(--muted-foreground))]">
                {t("sacrifice.preview.currentPrice", {
                  base: preview().currentPriceBase.toLocaleString(undefined, {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6,
                  }),
                  symbol: props.baseSymbol,
                  usd: preview().currentPriceUsd.toLocaleString(undefined, {
                    minimumFractionDigits: 6,
                    maximumFractionDigits: 6,
                  }),
                })}
              </span>
            </div>
          </div>

          <Show when={preview().warnHigher}>
            <div class="text-xs text-[hsl(var(--destructive))] font-medium">
              {t("sacrifice.preview.priceWarning")}
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

export default function SacrificePage() {
  const app = useApp();
  const { t } = app;

  const [refreshKey, setRefreshKey] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const [isDepositing, setIsDepositing] = createSignal(false);
  const [isClaiming, setIsClaiming] = createSignal(false);
  const [amountText, setAmountText] = createSignal("");
  const [amountWei, setAmountWei] = createSignal(0n);
  const [amountError, setAmountError] = createSignal("");
  const [amountInitialized, setAmountInitialized] = createSignal(false);
  const [isFinalizing, setIsFinalizing] = createSignal(false);

  onMount(() => {
    if (isWalletAvailable()) {
      eagerConnect().catch(() => { });
    }
    const nowTimer = setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => {
      clearInterval(nowTimer);
    });
  });

  const [state] = createResource(
    () => {
      const info = app.info();
      if (!info) return null;
      return { account: walletAccount(), refresh: refreshKey() };
    },
    async (source) => {
      if (!source) return null;
      try {
        const [faucet, config] = await Promise.all([
          getSavvaContract(app, "SavvaFaucet"),
          getSavvaContract(app, "Config"),
        ]);

        const [
          roundLength,
          roundPayWeek,
          lastRoundPayWeek,
          roundTokensToShare,
          roundTotalDeposits,
          roundTotalDepositors,
          tokensToShare,
          isRoundFinished,
          minDeposit,
        ] = await Promise.all([
          faucet.read.getRoundLength(),
          faucet.read.roundPayWeek(),
          faucet.read.lastRoundPayWeek(),
          faucet.read.roundTokensToShare(),
          faucet.read.roundTotalDeposits(),
          faucet.read.roundTotalDepositors(),
          faucet.read.TokensToShare(),
          faucet.read.IsRoundFinished(),
          config.read.getUInt([toHexBytes32("sac_min_deposit")]),
        ]);

        let deposited = 0n;
        let claimableAmount = 0n;
        if (source.account) {
          [deposited, claimableAmount] = await Promise.all([
            faucet.read.get_deposited([source.account]),
            faucet.read.claimable([source.account]),
          ]);
        }

        return {
          roundLength,
          roundPayWeek,
          lastRoundPayWeek,
          roundTokensToShare,
          roundTotalDeposits,
          roundTotalDepositors,
          tokensToShare,
          isRoundFinished,
          minDeposit,
          deposited,
          claimableAmount,
        };
      } catch (err) {
        console.error("SacrificePage: failed to load", err);
        throw err;
      }
    },
    { initialValue: null }
  );

  const nativeSymbol = () => app.desiredChain?.()?.nativeCurrency?.symbol || "PLS";
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;

  createEffect(() => {
    const data = state();
    if (!data || amountInitialized()) return;
    if (data?.minDeposit && data.minDeposit > 0n) {
      const initial = trimAmountString(formatUnits(data.minDeposit, 18));
      setAmountText(initial);
      setAmountWei(data.minDeposit);
    }
    setAmountInitialized(true);
  });

  const computed = createMemo(() => {
    const data = state();
    if (!data) return null;

    const roundLengthSec = Number(data.roundLength || 0n);
    const nowSec = Math.floor(now() / 1000);
    const currentRound = roundLengthSec > 0 ? Math.floor(nowSec / roundLengthSec) : null;
    const lastRoundPaid = Number(data.lastRoundPayWeek || 0n);

    const tokensFull = data.tokensToShare && data.tokensToShare > 0n ? data.tokensToShare : 0n;

    const tokensForDepositors = tokensFull * (100n - STAKING_SHARE) / 100n;

    const roundEndSec = currentRound != null && roundLengthSec > 0 ? (currentRound + 1) * roundLengthSec : null;

    const roundFinished = data.isRoundFinished ?? false;
    const totalDepositsRaw = data.roundTotalDeposits || 0n;
    const totalDepositorsRaw = Number(data.roundTotalDepositors || 0n);

    const totalDeposits = roundFinished ? 0n : totalDepositsRaw;
    const totalDepositors = roundFinished ? 0 : totalDepositorsRaw;

    const finishedRoundTotals = {
      totalDeposits: totalDepositsRaw,
      totalDepositors: totalDepositorsRaw,
    };

    const depositsFloat = Number(formatUnits(totalDeposits, 18));
    const distributedFloat = Number(formatUnits(tokensForDepositors, 18));
    const basePricePerSavva = distributedFloat > 0 ? depositsFloat / distributedFloat : 0;
    const baseTokenUsd = Number(app.baseTokenPrice?.()?.price ?? 0);
    const usdPricePerSavva = basePricePerSavva * baseTokenUsd;

    return {
      currentRound,
      tokensForDepositors,
      totalDeposits,
      totalDepositors,
      claimableAmount: data.claimableAmount || 0n,
      roundLengthSec,
      lastRoundPaid,
      isRoundFinished: data.isRoundFinished ?? false,
      roundTokensToShare: data.roundTokensToShare || 0n,
      finishedRound: Number(data.roundPayWeek || 0n),
      finishedRoundTotals,
      roundEndTs: roundEndSec,
      expectedSavvaPriceBase: basePricePerSavva,
      expectedSavvaPriceUsd: usdPricePerSavva,
    };
  });

  const roundEndTs = createMemo(() => computed()?.roundEndTs ?? null);
  const baseTokenPrice = createMemo(() => Number(app.baseTokenPrice?.()?.price ?? 0));
  const claimableAmount = createMemo(() => computed()?.claimableAmount || 0n);
  const userDepositedAmount = createMemo(() => {
    const comp = computed();
    const data = state();
    if (!comp || !data) return 0n;
    return comp.isRoundFinished ? 0n : (data.deposited || 0n);
  });

  const depositPreview = createMemo(() => {
    const comp = computed();
    const totalDeposits = comp?.totalDeposits || 0n;
    const userDeposited = userDepositedAmount();
    const tokensForDepositors = comp?.tokensForDepositors || 0n;

    const pending = amountWei() || 0n;
    const totalAfterWei = totalDeposits + pending;
    const userAfterWei = userDeposited + pending;

    const distributedBase = Number(formatUnits(tokensForDepositors, 18));
    const currentTotalBase = Number(formatUnits(totalDeposits, 18));
    const totalAfterBase = Number(formatUnits(totalAfterWei, 18));
    const currentPriceBase = distributedBase > 0 ? currentTotalBase / distributedBase : 0;
    const newPriceBase = distributedBase > 0 ? totalAfterBase / distributedBase : 0;
    const currentPriceUsd = currentPriceBase * baseTokenPrice();
    const newPriceUsd = newPriceBase * baseTokenPrice();

    let expectedSavvaWei = 0n;
    if (tokensForDepositors > 0n && totalAfterWei > 0n) {
      expectedSavvaWei = tokensForDepositors * userAfterWei / totalAfterWei;
    }

    return {
      hasPending: pending > 0n,
      hasContext: totalAfterWei > 0n,
      totalAfterWei,
      userAfterWei,
      expectedSavvaWei,
      newPriceBase,
      newPriceUsd,
      currentPriceBase,
      currentPriceUsd,
      warnHigher: pending > 0n && newPriceUsd > currentPriceUsd + 1e-12,
    };
  });

  const minDepositLabel = createMemo(() => {
    const data = state();
    if (!data || !data.minDeposit || data.minDeposit <= 0n) return null;
    try {
      const formatted = trimAmountString(formatUnits(data.minDeposit || 0n, 18));
      return t("sacrifice.actions.minDeposit", {
        amount: formatted,
        symbol: nativeSymbol(),
      });
    } catch {
      return null;
    }
  });

  const isAmountValid = createMemo(() => {
    const data = state();
    if (!data) return false;
    const wei = amountWei();
    if (!wei || wei <= 0n) return false;
    if (data.minDeposit > 0n && wei < data.minDeposit) return false;
    return true;
  });

  const handleConnect = async () => {
    try {
      await connectWallet();
      if (app.desiredChainId?.()) {
        await app.ensureWalletOnDesiredChain?.();
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("SacrificePage: connect failed", err);
    }
  };

  const handleDeposit = async () => {
    const data = state();
    if (!data) return;
    if (!walletAccount()) {
      await handleConnect();
      return;
    }
    if (!isAmountValid()) return;

    const weiValue = amountWei();
    if (!weiValue || weiValue <= 0n) return;

    setIsDepositing(true);
    try {
      await app.ensureWalletOnDesiredChain?.();
      const faucet = await getSavvaContract(app, "SavvaFaucet", { write: true });
      await faucet.write.deposit([], { value: weiValue });
      pushToast({ type: "success", message: t("sacrifice.toast.depositSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("SacrificePage: deposit failed", err);
      pushErrorToast(err, { context: t("sacrifice.toast.depositError") });
    } finally {
      setIsDepositing(false);
    }
  };

  const handleClaim = async () => {
    const info = computed();
    if (!info || info.claimableAmount <= 0n) return;
    if (!walletAccount()) {
      await handleConnect();
      return;
    }

    setIsClaiming(true);
    try {
      await app.ensureWalletOnDesiredChain?.();
      const faucet = await getSavvaContract(app, "SavvaFaucet", { write: true });
      await faucet.write.claim();
      pushToast({ type: "success", message: t("sacrifice.toast.claimSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("SacrificePage: claim failed", err);
      pushErrorToast(err, { context: t("sacrifice.toast.claimError") });
    } finally {
      setIsClaiming(false);
    }
  };

  const handleFinalizeRound = async () => {
    if (!computed()?.isRoundFinished) return;
    if (!walletAccount()) {
      await handleConnect();
      return;
    }

    setIsFinalizing(true);
    try {
      await app.ensureWalletOnDesiredChain?.();
      const faucet = await getSavvaContract(app, "SavvaFaucet", { write: true });
      await faucet.write.finishRound();
      pushToast({ type: "success", message: t("sacrifice.toast.finalizeSuccess") });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("SacrificePage: finalize failed", err);
      pushErrorToast(err, { context: t("sacrifice.toast.finalizeError") });
    } finally {
      setIsFinalizing(false);
    }
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <main class="p-4 max-w-6xl mx-auto space-y-6">
      <ClosePageButton />

      <header class="space-y-2">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold">{t("sacrifice.title")}</h1>
            <p class="text-sm text-[hsl(var(--muted-foreground))] max-w-2xl">
              {t("sacrifice.description")}
            </p>
          </div>
          <button
            type="button"
            class="px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={refresh}
          >
            {t("sacrifice.refresh")}
          </button>
        </div>
      </header>

      <Show
        when={!state.loading}
        fallback={
          <div class="flex items-center justify-center py-20">
            <Spinner class="w-8 h-8" />
          </div>
        }
      >
        <Show
          when={!state.error}
          fallback={
            <div class="rounded-lg border border-[hsl(var(--destructive))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-3">
              <div class="text-lg font-semibold">{t("sacrifice.error.title")}</div>
              <div class="text-sm opacity-80">{t("sacrifice.error.description")}</div>
              <button
                type="button"
                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={refresh}
              >
                {t("sacrifice.error.retry")}
              </button>
            </div>
          }
        >
          {/* Overview stats */}
          <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-4">
              <div class="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    {(() => {
                      const round = computed()?.currentRound;
                      if (round == null) return t("sacrifice.round.title");
                      return t("sacrifice.round.roundLabel", {
                        round: round.toLocaleString(),
                      });
                    })()}
                  </div>
                  <div class="text-sm font-semibold">
                    {t("sacrifice.round.activeLabel")}
                  </div>
                </div>

                <div class="flex items-center justify-end">
                  <Show
                    when={roundEndTs() != null}
                    fallback={<span class="text-sm text-[hsl(var(--muted-foreground))]">{t("sacrifice.countdownExpired")}</span>}
                  >
                    <Countdown
                      targetTs={Number(roundEndTs())}
                      size="lg"
                      labelPosition="top"
                      labelStyle="short"
                    />
                  </Show>
                </div>
              </div>

              <div class="grid gap-4 md:grid-cols-3">
                <StatCard label={t("sacrifice.stats.tokensThisRound")}>
                  <TokenValue amount={computed()?.tokensForDepositors || 0n} tokenAddress={savvaTokenAddress()} />
                </StatCard>

                <StatCard label={t("sacrifice.stats.totalDeposits", { n: computed()?.totalDepositors || 0 })}>
                  <TokenValue amount={computed()?.totalDeposits || 0n} tokenAddress="0" />
                </StatCard>

                <StatCard label={t("sacrifice.stats.tokenPrice")}
                  hint={t("sacrifice.stats.tokenPriceHint", { symbol: nativeSymbol() })}
                >
                  <div class="text-sm font-semibold">
                    {(() => {
                      const base = (computed()?.expectedSavvaPriceBase ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6,
                      });
                      const usd = (computed()?.expectedSavvaPriceUsd ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6,
                      });
                      return t("sacrifice.tokenPriceLine", {
                        base,
                        symbol: nativeSymbol(),
                        usd,
                      });
                    })()}
                  </div>
                </StatCard>
              </div>
            </section>

            <Show when={computed()?.isRoundFinished}>
              <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-4">

                <div class="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <div class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {(() => {
                        const round = computed()?.finishedRound;
                        if (!round || round <= 0) return null;
                        return t("sacrifice.roundFinisher.roundLabel", {
                          round: round.toLocaleString(),
                        });
                      })()}
                    </div>
                    <h2 class="text-lg font-semibold">{t("sacrifice.roundFinisher.title")}</h2>
                    <p class="text-sm text-[hsl(var(--muted-foreground))]">
                      {t("sacrifice.roundFinisher.description")}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleFinalizeRound}
                    disabled={isFinalizing()}
                  >
                    <Show when={!isFinalizing()} fallback={<Spinner class="w-4 h-4" />}>
                      {t("sacrifice.roundFinisher.finalize")}
                    </Show>
                  </button>
                </div>

                <div class="grid gap-4 md:grid-cols-3">
                  <StatCard label={t("sacrifice.roundFinisher.totalDeposits")}>
                    <TokenValue amount={computed()?.finishedRoundTotals?.totalDeposits || 0n} tokenAddress="0" />
                  </StatCard>
                  <StatCard label={t("sacrifice.roundFinisher.totalDepositors")}>
                    <div class="text-xl font-semibold">
                      {(computed()?.finishedRoundTotals?.totalDepositors ?? 0).toLocaleString()}
                    </div>
                  </StatCard>
                  <StatCard label={t("sacrifice.roundFinisher.tokensToShare")}>
                    <TokenValue amount={computed()?.roundTokensToShare || 0n} tokenAddress={savvaTokenAddress()} />
                  </StatCard>
                </div>
              </section>
            </Show>

          </div>

          {/* Make a Sacrifice — left: inputs; right: current deposit (top) + preview + min deposit + button */}
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-6">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold">{t("sacrifice.actions.title")}</h2>
                <p class="text-sm opacity-80">{t("sacrifice.actions.subtitle")}</p>
              </div>
              <div class="flex items-center gap-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] px-3 py-2 w-full lg:max-w-xs lg:self-end">
                <span class="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  {t("sacrifice.actions.myContribution")}
                </span>
                <TokenValue amount={userDepositedAmount()} tokenAddress="0" format="vertical" />
              </div>
            </div>

            <Show
              when={!!walletAccount()}
              fallback={
                <div class="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] p-4 text-center space-y-3">
                  <div class="text-sm font-semibold">{t("fundraising.contribute.connectTitle")}</div>
                  <p class="text-xs opacity-80">{t("wallet.connectPrompt")}</p>
                  <button
                    type="button"
                    class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                    onClick={handleConnect}
                  >
                    {t("sacrifice.actions.connect")}
                  </button>
                </div>
              }
            >
              <div class="grid gap-6 lg:grid-cols-3 items-start">
                {/* LEFT: acceptance, amount input, errors (no current-deposit card here) */}
                <div class="space-y-4 lg:col-span-2">
                  <p class="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                    {t("sacrifice.actions.acceptance")}
                  </p>

                  <AmountInput
                    tokenAddress="0"
                    value={amountText()}
                    onChange={(payload) => {
                      const textValue = payload.text ?? "";
                      setAmountText(textValue);
                      if (typeof payload.amountWei === "bigint" && payload.amountWei >= 0n) {
                        setAmountWei(payload.amountWei);
                        setAmountError("");
                      } else {
                        setAmountWei(0n);
                        setAmountError(t("common.invalidNumber"));
                      }
                    }}
                    placeholder={t("sacrifice.actions.inputPlaceholder")}
                    showMax={false}
                  />
                  <Show when={amountError()}>
                    <div class="text-xs text-[hsl(var(--destructive))]">{amountError()}</div>
                  </Show>

                  <button
                    type="button"
                    class="w-full px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDeposit}
                    disabled={isDepositing() || !isAmountValid()}
                  >
                    <Show when={!isDepositing()} fallback={<Spinner class="w-4 h-4" />}>
                      {t("sacrifice.actions.deposit")}
                    </Show>
                  </button>

                  <Show when={minDepositLabel()}>
                    <div class="text-xs text-[hsl(var(--muted-foreground))]">{minDepositLabel()}</div>
                  </Show>

                </div>

                {/* RIGHT: current deposit (top) + preview + min deposit + primary action */}
                <div class="flex flex-col gap-3 self-start w-full lg:max-w-xs">
                  <DepositPreviewCard
                    t={t}
                    baseSymbol={nativeSymbol()}
                    preview={depositPreview}
                    savvaTokenAddress={savvaTokenAddress()}
                  />

                </div>
              </div>
            </Show>
          </section>

          {/* Final section: Claim */}
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-4">
            <h2 class="text-lg font-semibold">{t("sacrifice.claimSectionTitle")}</h2>
            <ClaimSummary
              t={t}
              claimableAmount={claimableAmount}
              savvaTokenAddress={savvaTokenAddress()}
              isClaiming={isClaiming}
              onClaim={handleClaim}
            />
          </section>
        </Show>
      </Show>
    </main>
  );
}
