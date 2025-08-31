// src/context/useTokenPrices.js
import { createSignal, onMount, onCleanup, createMemo } from "solid-js";
import { whenWsOpen, getWsApi } from "../net/wsRuntime";
import { dbg } from "../utils/debug";

export function useTokenPrices(app) {
  const [prices, setPrices] = createSignal({});

  const updatePrices = (data) => {
    if (!data || !data.tokens) return;
    setPrices(prev => ({ ...prev, ...data.tokens }));
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
  
  const savvaTokenPrice = createMemo(() => {
    const savvaTokenAddress = app.info()?.savva_contracts?.SavvaToken?.address;
    if (!savvaTokenAddress) return null;
    return prices()[savvaTokenAddress] || null;
  });
  
  const baseTokenPrice = createMemo(() => {
    // The key for the base/native token is an empty string
    return prices()[""] || null; 
  });

  return {
    allTokenPrices: prices,
    savvaTokenPrice,
    baseTokenPrice,
    updateTokenPrices: updatePrices
  };
}