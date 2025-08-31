// src/components/ui/TokenValue.jsx
import { createMemo, Show, createSignal, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";
import SavvaTokenIcon from "./icons/SavvaTokenIcon.jsx";
import { getChainLogo } from "../../blockchain/chainLogos.js";

export default function TokenValue(props) {
  const app = useApp();
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;
  const desiredChain = createMemo(() => app.desiredChain());

  const isBaseToken = createMemo(() => props.tokenAddress === "0");
  const tokenAddress = createMemo(() => props.tokenAddress || savvaTokenAddress());
  const isSavvaToken = createMemo(() => !isBaseToken() && tokenAddress()?.toLowerCase() === savvaTokenAddress()?.toLowerCase());

  const formattedAmount = createMemo(() => {
    try {
      const amount = parseFloat(formatUnits(BigInt(props.amount || 0), 18));
      return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return "0.00";
    }
  });

  const sourceUsdValue = createMemo(() => {
    let priceData = null;
    if (isSavvaToken()) {
      priceData = app.savvaTokenPrice();
    } else if (isBaseToken()) {
      priceData = app.baseTokenPrice();
    }
    
    if (!priceData?.price) return null;

    try {
      const amount = parseFloat(formatUnits(BigInt(props.amount || 0), 18));
      const price = priceData.price;
      const total = amount * price;
      return total.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    } catch {
      return null;
    }
  });

  const [displayUsdValue, setDisplayUsdValue] = createSignal(sourceUsdValue());
  const [isAnimating, setIsAnimating] = createSignal(false);

  createEffect(on(sourceUsdValue, (newValue, prevValue) => {
    if (prevValue === undefined || prevValue === null) {
      setDisplayUsdValue(newValue);
      return;
    }
    setDisplayUsdValue(prevValue);
    setIsAnimating(true);
    setTimeout(() => { setDisplayUsdValue(newValue); }, 200);
    setTimeout(() => { setIsAnimating(false); }, 400);
  }, { defer: true }));

  const TokenIcon = () => {
    if (isSavvaToken()) {
      return <SavvaTokenIcon class="w-4 h-4" />;
    }
    if (isBaseToken()) {
        const logoSrc = getChainLogo(desiredChain()?.id);
        if (logoSrc) {
            return <img src={logoSrc} alt={desiredChain()?.nativeCurrency.symbol} class="w-5 h-5" />;
        }
    }
    return null;
  };

  const isVertical = () => props.format === 'vertical';

  return (
    <Show
      when={isVertical()}
      fallback={
        <div class={`flex items-center gap-1.5 text-sm ${props.class || ''}`}>
          <TokenIcon />
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
          <TokenIcon />
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