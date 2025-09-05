// src/context/useTokenPrices.js
import { createSignal, onMount, createMemo } from "solid-js";
import { whenWsOpen, getWsApi } from "../net/wsRuntime";
import { dbg } from "../utils/debug";

export function useTokenPrices(app) {
  const [prices, setPrices] = createSignal({});

  const updatePrices = (data) => {
    if (!data) return;
    
    const normalizedTokens = {};
    if (data.tokens && typeof data.tokens === 'object') {
        for (const [addr, priceData] of Object.entries(data.tokens)) {
            normalizedTokens[addr.toLowerCase()] = priceData;
        }
    }

    // Also handle legacy flat structure for backward compatibility
    if (data.base_token_price) {
        normalizedTokens[""] = { price: data.base_token_price, gain: data.base_token_gain };
    }
    if (data.savva_token_price) {
        const savvaAddr = app.info()?.savva_contracts?.SavvaToken?.address;
        if (savvaAddr) {
            normalizedTokens[savvaAddr.toLowerCase()] = { price: data.savva_token_price, gain: data.savva_token_gain };
        }
    }

    if (Object.keys(normalizedTokens).length > 0) {
        setPrices((prev) => ({ ...prev, ...normalizedTokens }));
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

  const savvaTokenPrice = createMemo(() => {
    const savvaTokenAddress = app.info()?.savva_contracts?.SavvaToken?.address;
    const stakingAddress = app.info()?.savva_contracts?.Staking?.address;
    if (!savvaTokenAddress && !stakingAddress) return null;

    const p = prices();
    return (
      (savvaTokenAddress && p[savvaTokenAddress.toLowerCase()]) ||
      (stakingAddress && p[stakingAddress.toLowerCase()]) ||
      null
    );
  });

  const baseTokenPrice = createMemo(() => {
    // The key for the base/native token is an empty string
    return prices()[""] || null;
  });

  return {
    allTokenPrices: prices,
    savvaTokenPrice,
    baseTokenPrice,
    updateTokenPrices: updatePrices,
  };
}
