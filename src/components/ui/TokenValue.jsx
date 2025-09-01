// src/components/ui/TokenValue.jsx
import { createMemo, Show, createSignal, createEffect, on, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";
import SavvaTokenIcon from "./icons/SavvaTokenIcon.jsx";
import { getChainLogo } from "../../blockchain/chainLogos.js";

/**
 * TokenValue — shows amount (with correct decimals) + optional USD value.
 * Props:
 *   - amount: bigint | string | number
 *   - tokenAddress: string | "0" (base token)
 *   - format: "vertical" | (default inline)
 */
export default function TokenValue(props) {
  const app = useApp();

  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;
  const desiredChain = createMemo(() => app.desiredChain());

  const tokenAddressRaw = createMemo(() => props.tokenAddress ?? savvaTokenAddress());
  const isBaseToken = createMemo(() => tokenAddressRaw() === "0");
  const tokenAddressForMeta = createMemo(() => (isBaseToken() ? "" : tokenAddressRaw() || ""));

  const isSavvaToken = createMemo(() => {
    const a = (tokenAddressRaw() || "").toLowerCase();
    const s = (savvaTokenAddress() || "").toLowerCase();
    return !isBaseToken() && !!a && !!s && a === s;
  });

  // Resolve metadata (cached, SAVVA-aware)
  const [tokenMeta] = createResource(
    () => ({ app, addr: tokenAddressForMeta() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );

  // Format amount using real decimals
  const formattedAmount = createMemo(() => {
    try {
      const dec = Number(tokenMeta()?.decimals ?? 18);
      const amt = BigInt(props.amount ?? 0);
      const num = parseFloat(formatUnits(amt, isNaN(dec) ? 18 : dec));
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return "0.00";
    }
  });

  // USD value for SAVVA or base coin (if app provides price)
  const sourceUsdValue = createMemo(() => {
    let priceData = null;
    if (isSavvaToken()) priceData = app.savvaTokenPrice?.();
    else if (isBaseToken()) priceData = app.baseTokenPrice?.();

    if (!priceData?.price) return null;

    try {
      const dec = Number(tokenMeta()?.decimals ?? 18);
      const amt = BigInt(props.amount ?? 0);
      const units = parseFloat(formatUnits(amt, isNaN(dec) ? 18 : dec));
      const total = units * Number(priceData.price);
      return total.toLocaleString(undefined, { style: "currency", currency: "USD" });
    } catch {
      return null;
    }
  });

  // animation for USD change
  const [displayUsdValue, setDisplayUsdValue] = createSignal(sourceUsdValue());
  const [isAnimating, setIsAnimating] = createSignal(false);
  createEffect(on(sourceUsdValue, (next, prev) => {
    if (prev == null) { setDisplayUsdValue(next); return; }
    setDisplayUsdValue(prev);
    setIsAnimating(true);
    setTimeout(() => setDisplayUsdValue(next), 200);
    setTimeout(() => setIsAnimating(false), 400);
  }, { defer: true }));

  const Icon = () => {
    if (isSavvaToken()) return <SavvaTokenIcon class="w-4 h-4" />;
    if (isBaseToken()) {
      const LogoComponent = getChainLogo(desiredChain()?.id);
      return LogoComponent ? <LogoComponent class="w-5 h-5" /> : null;
    }
    return null;
  };

  const isVertical = () => props.format === "vertical";

  return (
    <Show
      when={isVertical()}
      fallback={
        <div class={`flex items-center gap-1.5 text-sm ${props.class || ''}`}>
          <Icon />
          <span class="font-semibold">{formattedAmount()}</span>
          <Show when={displayUsdValue()}>
            <span class="text-xs text-[hsl(var(--muted-foreground))]" classList={{ "default-animation": isAnimating() }}>
              ({displayUsdValue()})
            </span>
          </Show>
        </div>
      }
    >
      <div class={`flex flex-col items-end text-sm ${props.class || ''}`}>
        <div class="flex items-center gap-1.5">
          <Icon />
          <span class="font-semibold">{formattedAmount()}</span>
        </div>
        <Show when={displayUsdValue()}>
          <span class="text-xs text-[hsl(var(--muted-foreground))]" classList={{ "default-animation": isAnimating() }}>
            ({displayUsdValue()})
          </span>
        </Show>
      </div>
    </Show>
  );
}
