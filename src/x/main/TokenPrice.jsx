// src/x/main/TokenPrice.jsx
import { createSignal, createEffect, on, Show, createResource, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { getTokenInfo } from "../../blockchain/tokenMeta.jsx";

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

  const savvaAddr = () => app.info()?.savva_contracts?.SavvaToken?.address || "";

  // Fetch SAVVA token meta, but only when the address is available.
  const [savvaMeta] = createResource(
    () => (savvaAddr() ? { app, addr: savvaAddr() } : null),
    ({ app, addr }) => getTokenInfo(app, addr)
  );

  const Icon = () => {
    const I = savvaMeta()?.Icon;
    return I ? <I class="w-5 h-5" /> : null;
  };

  const [displayData, setDisplayData] = createSignal(sourceData());

  createEffect(
    on(
      sourceData,
      (newValue, prevValue) => {
        if (prevValue === undefined || prevValue === null) {
          setDisplayData(newValue);
          return;
        }
        setDisplayData(prevValue);
        setIsAnimating(true);
        setTimeout(() => setDisplayData(newValue), 200);
        setTimeout(() => setIsAnimating(false), 400);
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

  // Wait for both price data AND icon metadata to be ready.
  const isReady = createMemo(() => displayData() && savvaMeta() && !savvaMeta.loading);

  return (
    <Show when={isReady()}>
      <div class="flex items-center gap-2">
        <Icon />
        <div classList={{ "default-animation": isAnimating() }} class="flex items-center gap-2 text-sm">
          <span class="font-semibold">{formatPrice(displayData().price)}</span>
          <div classList={{ "text-emerald-500": displayData().gain >= 0, "text-red-500": displayData().gain < 0 }} class="flex items-center gap-1 text-xs">
            <Show when={displayData().gain >= 0} fallback={<DownArrow />}>
              <UpArrow />
            </Show>
            <span>{formatGain(displayData().gain)}</span>
          </div>
        </div>
      </div>
    </Show>
  );
}