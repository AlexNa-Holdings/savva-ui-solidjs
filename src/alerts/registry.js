// src/alerts/registry.js
import * as h from "./handlers.js";

/**
 * A map of WebSocket alert types to their handler functions.
 * The AlertManager uses this to delegate incoming messages.
 */
export const alertRegistry = {
  token_price_changed: h.handleTokenPriceChanged,
  content_processed: h.handleContentProcessed,
};