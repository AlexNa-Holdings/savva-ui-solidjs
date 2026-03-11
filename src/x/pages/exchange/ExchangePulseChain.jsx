// src/x/pages/exchange/ExchangePulseChain.jsx
import { createSignal, Show } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import { connectWallet, walletAccount, isWalletAvailable } from "../../../blockchain/wallet.js";

const GUARDARIAN_WIDGET_URL = "https://guardarian.com/calculator/v1?partner_api_token=d1eff59e-3c61-4af4-bc9e-b72c0a7d4f63&theme=blue&type=wide&swap_enabled=true&default_from_amount=20&default_fiat_currency=USD&crypto_currencies_list=%5B%7B%22ticker%22%3A%22PLS%22%2C%22network%22%3A%22PULSE%22%7D%5D&fiat_currencies_list=%5B%7B%22ticker%22%3A%22EUR%22%2C%22network%22%3A%22EUR%22%7D%2C%7B%22ticker%22%3A%22USD%22%2C%22network%22%3A%22USD%22%7D%2C%7B%22ticker%22%3A%22GBP%22%2C%22network%22%3A%22GBP%22%7D%2C%7B%22ticker%22%3A%22CAD%22%2C%22network%22%3A%22CAD%22%7D%5D";

export default function ExchangePulseChain() {
  const app = useApp();
  const { t } = app;
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [walletDetected, setWalletDetected] = createSignal(true);

  const handleConnect = async () => {
    if (!isWalletAvailable()) {
      setWalletDetected(false);
      return;
    }
    setIsConnecting(true);
    try {
      await connectWallet();
      await app.ensureWalletOnDesiredChain?.();
    } catch (err) {
      console.error("ExchangePulseChain: connect failed", err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <Show
        when={walletDetected()}
        fallback={
          <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
            <p class="text-[hsl(var(--muted-foreground))]">
              {t("wallet.notAvailable") || "No wallet detected. Please install a Web3 wallet."}
            </p>
          </section>
        }
      >
        <Show
          when={walletAccount()}
          fallback={
            <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center">
              <p class="text-[hsl(var(--muted-foreground))] mb-4">
                {t("exchange.connectWallet") || "Connect your wallet to use the exchange"}
              </p>
              <button
                class="px-6 py-2 rounded-md font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50"
                onClick={handleConnect}
                disabled={isConnecting()}
              >
                {isConnecting() ? (t("common.working") || "Working...") : (t("wallet.connect") || "Connect wallet")}
              </button>
            </section>
          }
        >
          <section
            class="rounded-lg overflow-hidden max-w-xl mx-auto"
            style={{ "background-color": "#131a3e" }}
          >
            <iframe
              width="100%"
              title="Guardarian Exchange"
              src={GUARDARIAN_WIDGET_URL}
              style={{ border: "none", height: "370px" }}
            />
          </section>
        </Show>
      </Show>
    </>
  );
}
