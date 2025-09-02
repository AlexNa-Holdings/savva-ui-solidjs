// src/components/ui/TokenValue.jsx
import { createMemo, Show, createSignal, createEffect, on, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";

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
  const chainId = createMemo(() => app.desiredChain()?.id || 0);

  // Address to use
  const tokenAddressRaw = createMemo(() => props.tokenAddress ?? savvaTokenAddress());
  const isBaseToken = createMemo(() => tokenAddressRaw() === "0");
  // Normalize for meta: "" (empty) means native/base coin
  const tokenAddressForMeta = createMemo(() => {
    const a = tokenAddressRaw();
    return (!a || a === "0") ? "" : String(a).toLowerCase();
  });

  // Meta (symbol, decimals, Icon) — key on addr + chain so native coin reacts to network changes
  const [tokenMeta] = createResource(
    () => [tokenAddressForMeta(), chainId()],
    ([addr]) => getTokenInfo(app, addr)
  );

  // DEV logs
  if (import.meta.env?.DEV) {
    createEffect(() => {
      console.debug("[TokenValue] key →", { addr: tokenAddressForMeta(), chainId: chainId() });
      console.debug("[TokenValue] meta →", tokenMeta());
      console.debug("[TokenValue] has Icon →", typeof tokenMeta()?.Icon === "function");
    });
  }

  // Amount formatting
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

  // SAVVA & SAVVA_VOTES share the same USD price source
  const isSavvaLike = createMemo(() => {
    const sym = tokenMeta()?.symbol;
    return sym === "SAVVA" || sym === "SAVVA_VOTES";
  });

  const sourceUsdValue = createMemo(() => {
    let priceData = null;
    if (isSavvaLike())        priceData = app.savvaTokenPrice?.();
    else if (isBaseToken())   priceData = app.baseTokenPrice?.();

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

  // Tiny animation for USD changes
  const [displayUsdValue, setDisplayUsdValue] = createSignal(sourceUsdValue());
  const [isAnimating, setIsAnimating] = createSignal(false);
  createEffect(on(sourceUsdValue, (next, prev) => {
    if (prev == null) { setDisplayUsdValue(next); return; }
    setDisplayUsdValue(prev);
    setIsAnimating(true);
    setTimeout(() => setDisplayUsdValue(next), 200);
    setTimeout(() => setIsAnimating(false), 400);
  }, { defer: true }));

  // Icon: render NOTHING until we have a real component; then render it.
  // Using keyed <Show> guarantees the function value (component) is passed cleanly.
  const Icon = () => (
    <Show when={tokenMeta()?.Icon} keyed>
      {(Comp) => {
        if (import.meta.env?.DEV) console.debug("[TokenValue] <Icon/> render →", { type: typeof Comp, name: Comp?.name });
        return <Comp class="w-4 h-4" />;
      }}
    </Show>
  );

  const isVertical = () => props.format === "vertical";

  return (
    <Show
      when={isVertical()}
      fallback={
        <div class={`flex items-center gap-1.5 text-sm ${props.class || ''}`} data-tv="row">
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
      <div class={`flex flex-col items-end text-sm ${props.class || ''}`} data-tv="row">
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
