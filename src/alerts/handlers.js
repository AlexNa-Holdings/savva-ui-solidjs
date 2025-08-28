// src/alerts/handlers.js
import { dbg } from "../utils/debug";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../editor/storage.js";
import { pushToast } from "../ui/toast";

export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload);
}

export async function handleContentProcessed(app, payload) {
  const { content } = payload.data || {}; // Correctly get content from the nested data object
  if (!content || !content.guid) {
    return; // Silently ignore if the payload is not what we expect
  }

  dbg.log("Alerts:content_processed", "Handler triggered with content:", content);

  // Check against saved draft
  const draftParams = await getDraftParams(DRAFT_DIRS.NEW_POST);
  if (draftParams && draftParams.guid === content.guid) {
    await clearDraft(DRAFT_DIRS.NEW_POST);
    pushToast({ type: "success", message: app.t("editor.publish.draftCleared") });
  }

  // Check if new content should trigger the banner
  const currentItems = app.newFeedItems();
  const isAlreadyVisible = currentItems.some(item => item.id === content.savva_cid);
  
  if (!isAlreadyVisible) {
    app.setNewContentAvailable(content);
  }
}

export function handlePing(app) {
  app.ws?.sendJson({ type: 'pong' });
}

export function handlePong() {
  // Do nothing
}