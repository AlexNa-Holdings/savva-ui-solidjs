// src/alerts/handlers.js
import { dbg } from "../utils/debug";

/**
 * Handles live token price updates from the WebSocket.
 */
export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload);
}

export async function handleContentProcessed(app, payload) {
  dbg.log("Alerts:content_processed", payload);
  const { content } = payload;
  if (!content || !content.guid) return;

  // Check if this processed content matches the user's saved draft
  const draftParams = await getNewPostDraftParams();
  if (draftParams && draftParams.guid === content.guid) {
    await clearNewPostDraft();
    pushToast({ type: "success", message: app.t("editor.publish.draftCleared") });
  }

  // Check if the new content is already visible in the "New" feed
  const currentItems = app.newFeedItems();
  const isAlreadyVisible = currentItems.some(item => item.id === content.savva_cid);
  if (!isAlreadyVisible) {
    app.setNewContentAvailable(content);
  }
}
