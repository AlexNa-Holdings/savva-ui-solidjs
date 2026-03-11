// src/x/pages/exchange/ExchangeMonad.jsx
import { createSignal, Show, Switch, Match } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import SwapPanel from "./SwapPanel.jsx";

export default function ExchangeMonad() {
  const app = useApp();
  const { t } = app;
  const [activeTab, setActiveTab] = createSignal("swap");

  const tabs = [
    { id: "swap", label: () => t("exchange.monad.tab.swap") || "Swap" },
    { id: "buysell", label: () => t("exchange.monad.tab.buySell") || "Buy & Sell" },
  ];

  return (
    <>
      <div class="flex justify-center gap-2 mb-6">
        {tabs.map((tab) => {
          const isActive = () => activeTab() === tab.id;
          return (
            <button
              type="button"
              onClick={() => setActiveTab(tab.id)}
              class={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                isActive()
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
                  : "bg-transparent text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
              }`}
              aria-pressed={isActive() ? "true" : "false"}
            >
              {tab.label()}
            </button>
          );
        })}
      </div>

      <Switch>
        <Match when={activeTab() === "swap"}>
          <SwapPanel />
        </Match>
        <Match when={activeTab() === "buysell"}>
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
            <p class="text-[hsl(var(--muted-foreground))]">
              {t("exchange.notAvailableYet") || "Not available yet. Stay tuned!"}
            </p>
          </section>
        </Match>
      </Switch>
    </>
  );
}
