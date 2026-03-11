// src/x/pages/exchange/SwapPanel.jsx
import { createSignal, createMemo, createEffect, Show, For, createResource } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import { connectWallet, walletAccount, isWalletAvailable } from "../../../blockchain/wallet.js";
import { getSwappableTokens } from "../../../blockchain/swappableTokens.js";
import { getTokenInfo } from "../../../blockchain/tokenMeta.jsx";
import { parseAmountWithDecimals } from "../../../blockchain/tokenAmount.js";
import { executeSwap, getSwapQuote } from "../../../blockchain/swap.js";
import { pushToast, pushErrorToast } from "../../../ui/toast.js";
import { formatUnits, createPublicClient } from "viem";
import { configuredHttp } from "../../../blockchain/contracts.js";
import { dbg } from "../../../utils/debug.js";
import Spinner from "../../ui/Spinner.jsx";
import TokenPicker from "./TokenPicker.jsx";

const SLIPPAGE_OPTIONS = [1, 3, 5];

export default function SwapPanel() {
  const app = useApp();
  const { t } = app;

  // Token list
  const tokens = createMemo(() => getSwappableTokens(app));

  const [fromIdx, setFromIdx] = createSignal(0);
  const [toIdx, setToIdx] = createSignal(1);
  const [inputAmount, setInputAmount] = createSignal("");
  const [slippage, setSlippage] = createSignal(1);
  const [customSlippage, setCustomSlippage] = createSignal("");
  const [showSlippage, setShowSlippage] = createSignal(false);
  const [isSwapping, setIsSwapping] = createSignal(false);
  const [swapStatus, setSwapStatus] = createSignal("");

  const swapContractAvailable = createMemo(() => !!app.info()?.savva_contracts?.SavvaSwap?.address);

  const fromToken = createMemo(() => tokens()[fromIdx()] || tokens()[0]);
  const toToken = createMemo(() => tokens()[toIdx()] || tokens()[1]);

  const fromAddr = createMemo(() => fromToken()?.address || "0");
  const toAddr = createMemo(() => toToken()?.address || "0");

  // SAVVA token index — one side must always be SAVVA
  const savvaIdx = createMemo(() => {
    const savvaAddr = app.info()?.savva_contracts?.SavvaToken?.address?.toLowerCase();
    if (!savvaAddr) return -1;
    return tokens().findIndex((t) => t.address.toLowerCase() === savvaAddr);
  });
  const isSavva = (idx) => idx === savvaIdx();

  // Token metadata (symbol, decimals, Icon) for all swappable tokens
  const [allMetas] = createResource(
    () => tokens().map((t) => t.address),
    async (addrs) => {
      const results = await Promise.all(
        addrs.map((a) => getTokenInfo(app, a === "0" ? "" : a))
      );
      return results;
    }
  );
  const fromMeta = createMemo(() => allMetas()?.[fromIdx()]);
  const toMeta = createMemo(() => allMetas()?.[toIdx()]);

  // Parse input to bigint
  const parsedAmountIn = createMemo(() => {
    try {
      const dec = fromMeta()?.decimals ?? 18;
      return parseAmountWithDecimals(inputAmount(), dec);
    } catch {
      return null;
    }
  });

  // Fetch "from" token balance
  const ERC20_BAL_ABI = [
    { name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  ];
  const [fromBalance] = createResource(
    () => walletAccount() && fromAddr() ? { owner: walletAccount(), addr: fromAddr() } : null,
    async ({ owner, addr }) => {
      const chain = app.desiredChain();
      const pc = createPublicClient({ chain, transport: configuredHttp(chain.rpcUrls[0]) });
      if (!addr || addr === "0") return await pc.getBalance({ address: owner });
      return await pc.readContract({ address: addr, abi: ERC20_BAL_ABI, functionName: "balanceOf", args: [owner] });
    }
  );
  const insufficientBalance = createMemo(() => {
    const amt = parsedAmountIn();
    const bal = fromBalance();
    if (amt == null || amt <= 0n || bal == null) return false;
    return amt > bal;
  });

  // Get USD price for a token address
  const getTokenPrice = (addr) => {
    if (!addr || addr === "0") return app.baseTokenPrice?.()?.price ?? null;
    const lower = addr.toLowerCase();
    const savvaAddr = app.info()?.savva_contracts?.SavvaToken?.address?.toLowerCase();
    const stakingAddr = app.info()?.savva_contracts?.Staking?.address?.toLowerCase();
    if (lower === savvaAddr || lower === stakingAddr) return app.savvaTokenPrice?.()?.price ?? null;
    return app.allTokenPrices?.()?.[lower]?.price ?? null;
  };

  // On-chain quote from SavvaSwap contract
  const [quotedOutput, setQuotedOutput] = createSignal(null); // bigint
  const [isQuoting, setIsQuoting] = createSignal(false);
  let quoteTimer = null;

  // Debounced quote fetcher - triggers when input/tokens change
  const triggerQuote = () => {
    clearTimeout(quoteTimer);
    setQuotedOutput(null);
    const amt = parsedAmountIn();
    if (!amt || amt <= 0n || !swapContractAvailable()) return;
    const fa = fromAddr();
    const ta = toAddr();
    if (fa === ta) return;

    setIsQuoting(true);
    quoteTimer = setTimeout(async () => {
      try {
        const out = await getSwapQuote(app, {
          fromAddress: fa === "0" ? "" : fa,
          toAddress: ta === "0" ? "" : ta,
          amountIn: amt,
        });
        setQuotedOutput(out);
      } catch (e) {
        console.warn("Swap quote failed:", e);
        setQuotedOutput(null);
      } finally {
        setIsQuoting(false);
      }
    }, 400);
  };

  // Watch for changes and re-quote
  createEffect(() => {
    // Access reactive deps
    parsedAmountIn();
    fromAddr();
    toAddr();
    triggerQuote();
  });

  // USD value of the input amount
  const fromUsdValue = createMemo(() => {
    const amt = parsedAmountIn();
    if (!amt || amt <= 0n) return null;
    const price = getTokenPrice(fromAddr());
    if (!price) return null;
    const fromDec = fromMeta()?.decimals ?? 18;
    const inputFloat = parseFloat(formatUnits(amt, fromDec));
    const total = inputFloat * Number(price);
    if (total < 0.01) return null;
    return total;
  });

  const fromUsdText = createMemo(() => {
    const v = fromUsdValue();
    if (v == null) return "";
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
  });

  // Format output from on-chain quote
  const formattedOutput = createMemo(() => {
    const out = quotedOutput();
    if (out == null) return "";
    const toDec = toMeta()?.decimals ?? 18;
    return parseFloat(formatUnits(out, toDec)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  });

  // USD value of the output amount
  const toUsdText = createMemo(() => {
    const out = quotedOutput();
    if (out == null) return "";
    const toDec = toMeta()?.decimals ?? 18;
    const outFloat = parseFloat(formatUnits(out, toDec));
    const price = getTokenPrice(toAddr());
    if (!price) return "";
    const usd = outFloat * Number(price);
    if (usd < 0.01) return "";
    return usd.toLocaleString(undefined, { style: "currency", currency: "USD" });
  });

  // Minimum output after slippage (bigint for the contract)
  const minOutputBigInt = createMemo(() => {
    const out = quotedOutput();
    if (out == null) return 0n;
    // Apply slippage: minOut = out * (100 - slippage) / 100
    const slipBps = BigInt(Math.round(effectiveSlippage() * 100)); // basis points * 100
    return out * (10000n - slipBps) / 10000n;
  });

  // Minimum output text for display
  const minOutputText = createMemo(() => {
    const min = minOutputBigInt();
    if (min <= 0n) return "";
    const toDec = toMeta()?.decimals ?? 18;
    const symbol = toMeta()?.symbol || "";
    const formatted = parseFloat(formatUnits(min, toDec)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    return `${formatted} ${symbol}`;
  });

  // Swap direction
  const handleFlip = () => {
    const f = fromIdx();
    const ti = toIdx();
    setFromIdx(ti);
    setToIdx(f);
    setInputAmount("");
  };

  // Token select
  // Enforce: at least one side must be SAVVA
  const handleFromChange = (idx) => {
    if (idx === toIdx()) setToIdx(fromIdx());
    setFromIdx(idx);
    // If neither side is SAVVA, force the other side to SAVVA
    if (!isSavva(idx) && !isSavva(toIdx()) && savvaIdx() >= 0) {
      setToIdx(savvaIdx());
    }
  };
  const handleToChange = (idx) => {
    if (idx === fromIdx()) setFromIdx(toIdx());
    setToIdx(idx);
    if (!isSavva(idx) && !isSavva(fromIdx()) && savvaIdx() >= 0) {
      setFromIdx(savvaIdx());
    }
  };

  // Slippage
  const effectiveSlippage = createMemo(() => {
    const c = parseFloat(customSlippage());
    if (!isNaN(c) && c > 0 && c <= 50) return c;
    return slippage();
  });

  // Execute swap
  const handleSwap = async () => {
    const amt = parsedAmountIn();
    if (!amt || amt <= 0n) return;

    setIsSwapping(true);
    setSwapStatus("");
    try {
      await executeSwap(app, {
        fromAddress: fromAddr() === "0" ? "" : fromAddr(),
        toAddress: toAddr() === "0" ? "" : toAddr(),
        amountIn: amt,
        amountOutMin: minOutputBigInt(),
        onStatus: setSwapStatus,
      });
      pushToast({ type: "success", message: t("exchange.swap.success") || "Swap completed!" });
      setInputAmount("");
    } catch (e) {
      pushErrorToast(e, { context: t("exchange.swap.error") || "Swap failed" });
    } finally {
      setIsSwapping(false);
      setSwapStatus("");
    }
  };

  // Wallet connect
  const [isConnecting, setIsConnecting] = createSignal(false);
  const handleConnect = async () => {
    if (!isWalletAvailable()) return;
    setIsConnecting(true);
    try {
      await connectWallet();
      await app.ensureWalletOnDesiredChain?.();
    } catch (e) {
      console.error("SwapPanel: connect failed", e);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div class="max-w-md mx-auto space-y-4">
      {/* Pair notice */}
      <p class="text-xs text-center text-[hsl(var(--muted-foreground))]">
        {t("exchange.swap.pairNotice", { token: app.desiredChain?.()?.savvaTokenSymbol || "SAVVA" })}
      </p>

      {/* From */}
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-lg font-semibold text-[hsl(var(--muted-foreground))]">{t("exchange.swap.from") || "From"}</span>
          <TokenPicker tokens={tokens()} metas={allMetas()} selectedIdx={fromIdx()} disabledIdx={toIdx()} lockedToSavva={!isSavva(toIdx())} savvaIdx={savvaIdx()} onSelect={handleFromChange} />
        </div>
        <input
          type="text"
          inputmode="decimal"
          placeholder="0.0"
          class="w-full bg-transparent text-2xl font-semibold text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          value={inputAmount()}
          onInput={(e) => setInputAmount(e.target.value)}
          disabled={isSwapping()}
        />
        <Show when={fromUsdText()}>
          <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{fromUsdText()}</div>
        </Show>
      </div>

      {/* Flip button */}
      <div class="flex justify-center -my-2 relative z-10">
        <button
          type="button"
          onClick={handleFlip}
          class="w-9 h-9 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] flex items-center justify-center hover:bg-[hsl(var(--muted))] transition-colors"
          disabled={isSwapping()}
        >
          <svg class="w-4 h-4 text-[hsl(var(--foreground))]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      {/* To */}
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-lg font-semibold text-[hsl(var(--muted-foreground))]">{t("exchange.swap.to") || "To"}</span>
          <TokenPicker tokens={tokens()} metas={allMetas()} selectedIdx={toIdx()} disabledIdx={fromIdx()} lockedToSavva={!isSavva(fromIdx())} savvaIdx={savvaIdx()} onSelect={handleToChange} />
        </div>
        <span class="text-2xl font-semibold text-[hsl(var(--foreground))]">
          <Show when={!isQuoting()} fallback={<span class="text-[hsl(var(--muted-foreground))] animate-pulse">...</span>}>
            {formattedOutput() || "0.0"}
          </Show>
        </span>
        <Show when={toUsdText()}>
          <div class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{toUsdText()}</div>
        </Show>
      </div>

      {/* Minimum output */}
      <Show when={minOutputText()}>
        <div class="text-xs text-[hsl(var(--muted-foreground))] text-right px-1">
          {t("exchange.swap.minReceived") || "Minimum received"}: {minOutputText()}
        </div>
      </Show>

      {/* Slippage */}
      <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
        <button
          type="button"
          class="flex items-center justify-between w-full text-sm"
          onClick={() => setShowSlippage(!showSlippage())}
        >
          <span class="text-[hsl(var(--muted-foreground))]">{t("exchange.swap.slippage") || "Slippage tolerance"}</span>
          <span class="font-medium">{effectiveSlippage()}%</span>
        </button>
        <Show when={showSlippage()}>
          <div class="flex items-center gap-2 mt-3">
            <For each={SLIPPAGE_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={`px-3 py-1 text-sm rounded-md transition-colors ${
                    slippage() === opt && !customSlippage()
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
                  }`}
                  onClick={() => { setSlippage(opt); setCustomSlippage(""); }}
                >
                  {opt}%
                </button>
              )}
            </For>
            <input
              type="text"
              inputmode="decimal"
              placeholder={t("exchange.swap.custom") || "Custom"}
              class="w-20 px-2 py-1 text-sm rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
              value={customSlippage()}
              onInput={(e) => setCustomSlippage(e.target.value)}
            />
          </div>
        </Show>
      </div>

      {/* Action button */}
      <Show
        when={walletAccount()}
        fallback={
          <button
            type="button"
            class="w-full py-3 rounded-lg font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50"
            onClick={handleConnect}
            disabled={isConnecting()}
          >
            {isConnecting() ? (t("common.working") || "Working...") : (t("wallet.connect") || "Connect wallet")}
          </button>
        }
      >
        <button
          type="button"
          class="w-full py-3 rounded-lg font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50"
          onClick={handleSwap}
          disabled={isSwapping() || !parsedAmountIn() || fromAddr() === toAddr() || !swapContractAvailable() || insufficientBalance()}
        >
          <Show when={isSwapping()} fallback={
            !swapContractAvailable()
              ? (t("exchange.swap.contractUnavailable") || "Swap contract not available")
              : insufficientBalance()
                ? (t("exchange.swap.insufficientBalance") || "Insufficient balance")
                : (t("exchange.swap.button") || "Swap")
          }>
            <span class="flex items-center justify-center gap-2">
              <Spinner class="w-4 h-4" />
              {swapStatus() === "approving" ? (t("exchange.swap.approving") || "Approving...")
                : swapStatus() === "confirming" ? (t("exchange.swap.confirming") || "Confirming...")
                : (t("exchange.swap.swapping") || "Swapping...")}
            </span>
          </Show>
        </button>
      </Show>

      {/* Disclaimer */}
      <p class="text-xs text-center text-[hsl(var(--muted-foreground))]">
        {t("exchange.swap.disclaimer") || "Swaps are executed via Uniswap protocol smart contracts"}
      </p>
    </div>
  );
}
