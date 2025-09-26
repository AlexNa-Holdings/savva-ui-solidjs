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
import { formatUnits, createPublicClient, http } from "viem";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import TokenValue from "../ui/TokenValue.jsx";
import Countdown from "../ui/Countdown.jsx";
import AmountInput from "../ui/AmountInput.jsx";
import Modal from "../modals/Modal.jsx";
import ProgressBar from "../ui/ProgressBar.jsx";
import SavvaFaucetAbi from "../../blockchain/abi/SavvaFaucet.json";
import {
  connectWallet,
  walletAccount,
  isWalletAvailable,
  eagerConnect,
} from "../../blockchain/wallet.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { toHexBytes32 } from "../../blockchain/utils.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js";

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
  const [isRoundRecalculating, setIsRoundRecalculating] = createSignal(false);
  const [roundRecalcProgress, setRoundRecalcProgress] = createSignal(0);
  const [roundEndTsStable, setRoundEndTsStable] = createSignal(null);
  let roundRecalcTimer;

  onMount(() => {
    if (isWalletAvailable()) {
      eagerConnect().catch(() => { });
    }
    const nowTimer = setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => clearInterval(nowTimer));
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
    const s = state();
    if (!s) return;

    const len = Number(s.roundLength || 0n);
    if (len <= 0) return;

    const nowSec = Math.floor(now() / 1000);
    const candidate = Math.ceil(nowSec / len) * len;

    // initialize or refresh the target while we're still before it
    if (!roundEndTsStable() || nowSec < roundEndTsStable()) {
      setRoundEndTsStable(candidate);
    }
  });

  createEffect(() => {
    const s = state();
    if (!s || amountInitialized()) return;
    setAmountText("0");
    setAmountWei(0n);
    setAmountInitialized(true);
  });

  const computed = createMemo(() => {
    const s = state();
    if (!s) return null;

    const roundLengthSec = Number(s.roundLength || 0n);
    const nowSec = Math.floor(now() / 1000);
    const currentRound = roundLengthSec > 0 ? Math.floor(nowSec / roundLengthSec) : null;


    const lastRoundPaid = Number(s.lastRoundPayWeek || 0n);

    const tokensFull = s.tokensToShare && s.tokensToShare > 0n ? s.tokensToShare : 0n;
    const tokensForDepositors = (tokensFull * (100n - STAKING_SHARE)) / 100n;

    const roundEndSec = currentRound != null && roundLengthSec > 0 ? (currentRound + 1) * roundLengthSec : null;


    const roundFinished = s.isRoundFinished ?? false;
    const totalDepositsRaw = s.roundTotalDeposits || 0n;
    const totalDepositorsRaw = Number(s.roundTotalDepositors || 0n);

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
      claimableAmount: s.claimableAmount || 0n,
      roundLengthSec,
      lastRoundPaid,
      isRoundFinished: s.isRoundFinished ?? false,
      roundTokensToShare: s.roundTokensToShare || 0n,
      finishedRound: Number(s.roundPayWeek || 0n),
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
    const s = state();
    if (!comp || !s) return 0n;
    return comp.isRoundFinished ? 0n : (s.deposited || 0n);
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
      expectedSavvaWei = (tokensForDepositors * userAfterWei) / totalAfterWei;
    }

    // Compare to market price (SAVVA/USD) with small buffer to avoid noise.
    const marketUsd = Number(app.savvaTokenPrice?.()?.price ?? 0);
    const marketBuffer = 1.005; // +0.5%
    const warnHigher =
      pending > 0n &&
      marketUsd > 0 &&
      newPriceUsd > marketUsd * marketBuffer;

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
      warnHigher,
    };
  });

  // ——— debug hooks (safe; no user-visible strings) ———
  const handleCountdownDone = () => {
    dbg.log("SacrificePage", "Countdown.onDone fired", {
      nowSec: Math.floor(Date.now() / 1000),
      roundEndTs: Number(roundEndTs()),
    });
    startRoundRecalculation();
  };
  createEffect(() => {
    const v = Number(roundEndTs() || 0);
    if (v > 0) dbg.log("SacrificePage", "roundEndTs", v);
  });
  createEffect(() => {
    if (isRoundRecalculating()) dbg.log("SacrificePage", "modal: open");
  });
  createEffect(() => {
    if (isRoundRecalculating()) dbg.log("SacrificePage", "progress", roundRecalcProgress().toFixed(1) + "%");
  });
  if (typeof window !== "undefined") {
    // quick manual test: __sac_debug.start()
    window.__sac_debug = {
      start: () => handleCountdownDone(),
      refresh: () => window.location.reload(),
      state,
      computed,
      roundEndTs,
    };
  }
  // ————————————————————————————————————————————————

  createEffect(() => {
    if (typeof window === "undefined") return;
    const info = app.info();
    const account = walletAccount();
    const chain = app.desiredChain?.();
    if (!info || !account || !chain?.rpcUrls?.[0]) return;

    const faucetAddress = info.savva_contracts?.SavvaFaucet?.address;
    if (!faucetAddress) return;

    const client = createPublicClient({ chain, transport: http(chain.rpcUrls[0]) });
    const userAddress = account.toLowerCase();

    const handleUserLogs = (logs = []) => {
      const relevant = logs.some((log) => String(log.args?.user || "").toLowerCase() === userAddress);
      if (relevant) {
        setRefreshKey((k) => k + 1);
      }
    };

    const unwatchers = [
      client.watchContractEvent({
        address: faucetAddress,
        abi: SavvaFaucetAbi,
        eventName: "Deposit",
        onLogs: handleUserLogs,
      }),
      client.watchContractEvent({
        address: faucetAddress,
        abi: SavvaFaucetAbi,
        eventName: "claimed",
        onLogs: handleUserLogs,
      }),
      client.watchContractEvent({
        address: faucetAddress,
        abi: SavvaFaucetAbi,
        eventName: "RoundFinished",
        onLogs: () => setRefreshKey((k) => k + 1),
      }),
    ];

    onCleanup(() => {
      for (const stop of unwatchers) {
        try {
          stop?.();
        } catch (err) {
          console.error("SacrificePage: failed to unwatch event", err);
        }
      }
    });
  });

  const minDepositLabel = createMemo(() => {
    const s = state();
    if (!s || !s.minDeposit || s.minDeposit <= 0n) return null;
    try {
      const formatted = trimAmountString(formatUnits(s.minDeposit || 0n, 18));
      return t("sacrifice.actions.minDeposit", {
        amount: formatted,
        symbol: nativeSymbol(),
      });
    } catch {
      return null;
    }
  });

  const isAmountValid = createMemo(() => {
    const s = state();
    if (!s) return false;
    const wei = amountWei();
    if (!wei || wei <= 0n) return false;
    if (s.minDeposit > 0n && wei < s.minDeposit) return false;
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
    const s = state();
    if (!s) return;
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
      const txHash = await faucet.write.finishRound();
      const chain = app.desiredChain?.();
      const rpcUrl = chain?.rpcUrls?.[0];
      if (chain && rpcUrl) {
        try {
          const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        } catch (waitErr) {
          console.warn("SacrificePage: wait for finalize receipt failed", waitErr);
        }
      }
      pushToast({ type: "success", message: t("sacrifice.toast.finalizeSuccess") });
      setRefreshKey((k) => k + 1);
      if (typeof window !== "undefined" && window?.location) {
        window.location.reload();
      }
    } catch (err) {
      console.error("SacrificePage: finalize failed", err);
      pushErrorToast(err, { context: t("sacrifice.toast.finalizeError") });
    } finally {
      setIsFinalizing(false);
    }
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const startRoundRecalculation = () => {
    if (isRoundRecalculating()) return;

    setIsRoundRecalculating(true);
    setRoundRecalcProgress(0);

    const durationMs = 10_000;
    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const percentage = Math.min(100, (elapsed / durationMs) * 100);
      setRoundRecalcProgress(percentage);

      if (elapsed >= durationMs) {
        if (roundRecalcTimer) {
          clearInterval(roundRecalcTimer);
          roundRecalcTimer = undefined;
        }
        setRoundRecalcProgress(100);

        setTimeout(() => {
          if (typeof window !== "undefined" && window?.location) {
            window.location.reload();
          } else {
            refresh();
            setIsRoundRecalculating(false);
          }
        }, 150);
      }
    };

    tick();
    roundRecalcTimer = setInterval(tick, 200);
  };

  onCleanup(() => {
    if (roundRecalcTimer) {
      clearInterval(roundRecalcTimer);
      roundRecalcTimer = undefined;
    }
  });

  return (
    <>
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
                        targetTs={Number(roundEndTsStable() ?? roundEndTs() ?? 0)}   // ← use the stable target
                        size="lg"
                        labelPosition="top"
                        labelStyle="short"
                        onDone={() => {
                          handleCountdownDone();
                          // (optional) if you don't reload here, you could advance the stable target by +round length
                        }}
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

                  <StatCard
                    label={t("sacrifice.stats.tokenPrice")}
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

            {/* Make a Sacrifice */}
            <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-6 space-y-6">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-1">
                  <h2 class="text-lg font-semibold">{t("sacrifice.actions.title")}</h2>
                  <p class="text-sm opacity-80">{t("sacrifice.actions.subtitle")}</p>
                </div>
                <div class="flex items-start justify-between gap-3 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--accent)/0.08)] px-3 py-2 w-full lg:max-w-xs lg:self-end">
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
                  <div class="space-y-4 lg:col-span-2">
                    <p class="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                      {t("sacrifice.actions.acceptance")}
                    </p>

                    <AmountInput
                      label={t("sacrifice.actions.inputLabel")}
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

      <Modal
        isOpen={isRoundRecalculating()}
        onClose={() => { }}
        preventClose
        showClose={false}
        size="sm"
      >
        <div class="space-y-4">
          <div>
            <h3 class="text-lg font-semibold">{t("sacrifice.recalc.title")}</h3>
            <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("sacrifice.recalc.description")}</p>
          </div>
          <ProgressBar value={roundRecalcProgress()} />
        </div>
      </Modal>
    </>
  );
}
