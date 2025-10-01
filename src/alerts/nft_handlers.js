// src/alerts/nft_handlers.js
import { dbg } from "../utils/debug.js";

/**
 * Registers all NFT-related alert handlers.
 * These handlers update PostNftCard components when NFT events occur.
 *
 * @param {Object} app - The app context
 */
export function registerNftHandlers(app) {
  const { alertManager } = app;
  if (!alertManager) {
    dbg.warn?.("registerNftHandlers", "AlertManager not available");
    return;
  }

  // Helper to trigger refetch on PostNftCard for a given content_id
  const triggerNftUpdate = (contentId, eventType) => {
    dbg.log("NFTHandler", `${eventType} for content_id: ${contentId}`);
    // Dispatch a custom event that PostNftCard components can listen to
    const event = new CustomEvent("nft-update", {
      detail: { contentId, eventType }
    });
    window.dispatchEvent(event);
  };

  // --- NFT Minted ---
  alertManager.on("nft_minted", (data) => {
    dbg.log("NFTHandler:minted", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_minted");
    }
  });

  // --- NFT Burned ---
  alertManager.on("nft_burned", (data) => {
    dbg.log("NFTHandler:burned", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_burned");
    }
  });

  // --- NFT Transferred ---
  alertManager.on("nft_transferred", (data) => {
    dbg.log("NFTHandler:transferred", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_transferred");
    }
  });

  // --- NFT Added to Market ---
  alertManager.on("nft_added_to_market", (data) => {
    dbg.log("NFTHandler:added_to_market", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_added_to_market");
    }
  });

  // --- NFT Removed from Market ---
  alertManager.on("nft_removed_from_market", (data) => {
    dbg.log("NFTHandler:removed_from_market", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_removed_from_market");
    }
  });

  // --- NFT Bought ---
  alertManager.on("nft_bought", (data) => {
    dbg.log("NFTHandler:bought", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_bought");
    }
  });

  // --- NFT Price Changed ---
  alertManager.on("nft_price_changed", (data) => {
    dbg.log("NFTHandler:price_changed", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_price_changed");
    }
  });

  // --- NFT Owner Changed ---
  alertManager.on("nft_owner_changed", (data) => {
    dbg.log("NFTHandler:owner_changed", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_owner_changed");
    }
  });

  // --- NFT Auction Created ---
  alertManager.on("nft_auction_created", (data) => {
    dbg.log("NFTHandler:auction_created", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_auction_created");
    }
  });

  // --- NFT Auction Bid ---
  alertManager.on("nft_auction_bid", (data) => {
    dbg.log("NFTHandler:auction_bid", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_auction_bid");
    }
  });

  // --- NFT Auction Ended ---
  alertManager.on("nft_auction_ended", (data) => {
    dbg.log("NFTHandler:auction_ended", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_auction_ended");
    }
  });

  // --- NFT Auction Canceled ---
  alertManager.on("nft_auction_canceled", (data) => {
    dbg.log("NFTHandler:auction_canceled", data);
    if (data.content_id) {
      triggerNftUpdate(data.content_id, "nft_auction_canceled");
    }
  });

  dbg.log("NFTHandlers", "All NFT alert handlers registered");
}
