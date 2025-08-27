// src/alerts/handlers.js
import { dbg } from "../utils/debug";

/**
 * Handles live token price updates from the WebSocket.
 */
export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload);
}
