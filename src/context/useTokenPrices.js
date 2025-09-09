// src/context/useTokenPrices.js
import { createSignal, createEffect, createMemo } from "solid-js";
import { whenWsOpen, getWsApi } from "../net/wsRuntime";
import { dbg } from "../utils/debug";

export function useTokenPrices(props) {
  const [prices, setPrices] = createSignal({});

  const updatePrices = (data) => {
    if (!data) return;
    
    const normalizedTokens = {};
    if (data.tokens && typeof data.tokens === 'object') {
        for (const [addr, priceData] of Object.entries(data.tokens)) {
            normalizedTokens[addr.toLowerCase()] = priceData;
        }
    }

    if (data.base_token_price) {
        normalizedTokens[""] = { price: data.base_token_price, gain: data.base_token_gain };
    }
    if (data.savva_token_price) {
        const savvaAddr = props.info()?.savva_contracts?.SavvaToken?.address;
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

  createEffect(() => {
    // Wait until the main app orchestrator is done loading.
    if (typeof props.loading === 'function' && !props.loading()) {
      fetchInitialPrices();
    }
  });

  const savvaTokenPrice = createMemo(() => {
    const savvaTokenAddress = props.info()?.savva_contracts?.SavvaToken?.address;
    const stakingAddress = props.info()?.savva_contracts?.Staking?.address;
    if (!savvaTokenAddress && !stakingAddress) return null;

    const p = prices();
    return (
      (savvaTokenAddress && p[savvaTokenAddress.toLowerCase()]) ||
      (stakingAddress && p[stakingAddress.toLowerCase()]) ||
      null
    );
  });

  const baseTokenPrice = createMemo(() => {
    return prices()[""] || null;
  });

  return {
    allTokenPrices: prices,
    savvaTokenPrice,
    baseTokenPrice,
    updateTokenPrices: updatePrices,
  };
}