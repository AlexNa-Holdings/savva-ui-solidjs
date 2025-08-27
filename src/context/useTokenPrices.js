// src/context/useTokenPrices.js
import { createSignal, onMount, onCleanup } from "solid-js";
import { whenWsOpen, getWsApi } from "../net/wsRuntime";
import { dbg } from "../utils/debug";

export function useTokenPrices(app) {
  const [prices, setPrices] = createSignal(null);

  const updatePrices = (data) => {
    if (!data || !data.tokens) return;
    const savvaTokenAddress = app.info()?.savva_contracts?.SavvaToken?.address;
    if (!savvaTokenAddress) return;

    const savvaPriceData = data.tokens[savvaTokenAddress];
    if (savvaPriceData) {
      setPrices({
        price: savvaPriceData.price,
        gain: savvaPriceData.gain
      });
    }
  };

  const fetchInitialPrices = async () => {
    try {
      await whenWsOpen();
      const api = getWsApi();
      const data = await api.call("get-token-prices");
      dbg.log("TokenPrices", "Fetched initial prices", data);
      updatePrices(data);
    } catch (error) {
      dbg.error("TokenPrices", "Failed to fetch initial token prices", error);
    }
  };

  onMount(() => {
    fetchInitialPrices();
  });

  return {
    savvaTokenPrice: prices,
    updateTokenPrices: updatePrices
  };
}