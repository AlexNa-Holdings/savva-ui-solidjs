// src/components/main/TokenPrice.jsx
import { createSignal, createEffect, on, Show, createResource } from "solid-js";
import { useApp } from "../../context/AppContext";
import { getTokenInfo } from "../../blockchain/tokenMeta.js";

function UpArrow() {
  return (
    <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

export default function TokenPrice() {
  const app = useApp();
  const [isAnimating, setIsAnimating] = createSignal(false);
  const sourceData = () => app.savvaTokenPrice();

  // Fetch SAVVA token meta to render its icon via the single source of truth
  const savvaAddr = () => app.info()?.savva_contracts?.SavvaToken?.address || "";
  const [savvaMeta] = createResource(
    () => ({ app, addr: savvaAddr() }),
    ({ app, addr }) => getTokenInfo(app, addr)
  );
  const Icon = () => {
    const I = savvaMeta()?.Icon;
    return I ? <I class="w-5 h-5" /> : null;
  };

  // This signal holds the price data that is currently visible on screen.
  const [displayData, setDisplayData] = createSignal(sourceData());

  // Effect to handle the animation logic.
  createEffect(
    on(
      sourceData,
      (newValue, prevValue) => {
        // Don't animate on initial render
        if (prevValue === undefined || prevValue === null) {
          setDisplayData(newValue);
          return;
        }

        // 1. Start the animation, showing the OLD value first.
        setDisplayData(prevValue);
        setIsAnimating(true);

        // 2. Halfway through the 400ms animation, swap to the NEW value.
        setTimeout(() => {
          setDisplayData(newValue);
        }, 200);

        // 3. After the animation is complete, remove the animation class.
        setTimeout(() => {
          setIsAnimating(false);
        }, 400);
      },
      { defer: true }
    )
  );

  const formatPrice = (price) => {
    if (typeof price !== "number") return (0).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return price.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
  };

  const formatGain = (gain) => {
    if (typeof gain !== "number") return (0).toFixed(2) + "%";
    return `${gain.toFixed(2)}%`;
  };

  return (
    <Show when={displayData()}>
      {(data) => (
        <div class="flex items-center gap-2">
          <Icon />
          <div classList={{ "default-animation": isAnimating() }} class="flex items-center gap-2 text-sm">
            <span class="font-semibold">{formatPrice(data().price)}</span>
            <div classList={{ "text-emerald-500": data().gain >= 0, "text-red-500": data().gain < 0 }} class="flex items-center gap-1 text-xs">
              <Show when={data().gain >= 0} fallback={<DownArrow />}>
                <UpArrow />
              </Show>
              <span>{formatGain(data().gain)}</span>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
