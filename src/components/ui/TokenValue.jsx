// src/components/ui/TokenValue.jsx
import { createMemo, Show, createSignal, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";
import SavvaTokenIcon from "./icons/SavvaTokenIcon.jsx";

export default function TokenValue(props) {
  const app = useApp();
  const savvaTokenAddress = () => app.info()?.savva_contracts?.SavvaToken?.address;

  const tokenAddress = createMemo(() => props.tokenAddress || savvaTokenAddress());
  const isSavvaToken = createMemo(() => tokenAddress()?.toLowerCase() === savvaTokenAddress()?.toLowerCase());

  const formattedAmount = createMemo(() => {
    try {
      const amount = parseFloat(formatUnits(BigInt(props.amount || 0), 18));
      return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      return "0.00";
    }
  });

  const sourceUsdValue = createMemo(() => {
    if (!isSavvaToken() || !app.savvaTokenPrice()?.price) return null;
    try {
      const amount = parseFloat(formatUnits(BigInt(props.amount || 0), 18));
      const price = app.savvaTokenPrice().price;
      const total = amount * price;
      return total.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    } catch {
      return null;
    }
  });

  const [displayUsdValue, setDisplayUsdValue] = createSignal(sourceUsdValue());
  const [isAnimating, setIsAnimating] = createSignal(false);

  // Effect to handle the animation logic.
  createEffect(on(sourceUsdValue, (newValue, prevValue) => {
    if (prevValue === undefined || prevValue === null) {
      setDisplayUsdValue(newValue);
      return;
    }

    setDisplayUsdValue(prevValue);
    setIsAnimating(true);

    setTimeout(() => {
      setDisplayUsdValue(newValue);
    }, 200);

    setTimeout(() => {
      setIsAnimating(false);
    }, 400);

  }, { defer: true }));

  const TokenIcon = () => {
    if (isSavvaToken()) {
      return <SavvaTokenIcon class="w-4 h-4 mr-1.5" />;
    }
    // Future: Add logic for other token icons
    return null;
  };

  const isVertical = () => props.format === 'vertical';

  return (
    <div 
      class={`flex text-sm ${props.class || ''}`}
      classList={{
        'items-center': !isVertical(),
        'items-start': isVertical()
      }}
    >
      <TokenIcon />
      <div classList={{
        "flex items-center gap-2": !isVertical(),
        "flex flex-col items-end": isVertical()
      }}>
        <span class="font-semibold">{formattedAmount()} SAVVA</span>
        <Show when={displayUsdValue()}>
          <span
            class="text-xs text-[hsl(var(--muted-foreground))]"
            classList={{ "default-animation": isAnimating() }}
          >
            ({displayUsdValue()})
          </span>
        </Show>
      </div>
    </div>
  );
}

