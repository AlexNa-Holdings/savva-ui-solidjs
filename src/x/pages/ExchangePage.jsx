// src/x/pages/ExchangePage.jsx
import { createMemo, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import ExchangeEMPX from "./exchange/ExchangeEMPX.jsx";

const EMPX_CHAIN_IDS = new Set([
  143,   // Monad
  10143, // Monad Testnet
  369,   // PulseChain
  943,   // PulseChain Testnet v4
]);

export default function ExchangePage() {
  const app = useApp();
  const { t } = app;
  const chainId = createMemo(() => app.desiredChain()?.id);

  return (
    <main class="sv-container p-4">
      <ClosePageButton />
      <h1 class="text-2xl font-bold mb-6">{t("exchange.title") || "Exchange"}</h1>

      <Switch
        fallback={
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
            <p class="text-[hsl(var(--muted-foreground))]">
              {t("exchange.notAvailable") || "Exchange functionality is not yet available for this network. Stay tuned!"}
            </p>
          </section>
        }
      >
        <Match when={EMPX_CHAIN_IDS.has(chainId())}>
          <ExchangeEMPX />
        </Match>
      </Switch>
    </main>
  );
}
