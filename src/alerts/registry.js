// src/alerts/registry.js
import { handleTokenPriceChanged } from "./handlers.js";

/**
 * A map of WebSocket alert types to their handler functions.
 * The AlertManager uses this to delegate incoming messages.
 */
export const alertRegistry = {
  token_price_changed: handleTokenPriceChanged,
};