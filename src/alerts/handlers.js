// src/alerts/handlers.js
import { dbg } from "../utils/debug";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../editor/storage.js";
import { pushToast } from "../ui/toast";

export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload);
}

export async function handleContentProcessed(app, payload) {
  const { content } = payload.data || {};
  if (!content || !content.guid) {
    return;
  }

  dbg.log("Alerts:content_processed", "Handler triggered with content:", content);

  const draftParams = await getDraftParams(DRAFT_DIRS.NEW_POST);
  if (draftParams && draftParams.guid === content.guid) {
    await clearDraft(DRAFT_DIRS.NEW_POST);
    pushToast({ type: "success", message: app.t("editor.publish.draftCleared") });
  }

  const currentItems = app.newFeedItems();
  const isAlreadyVisible = currentItems.some(item => item.id === content.savva_cid);
  
  if (!isAlreadyVisible) {
    app.setNewContentAvailable(content);
  }
}

export function handlePing(app) {
  dbg.log("Alerts:ping", "Received ping, sending pong.");
  app.ws?.sendJson({ type: 'pong' });
}

export function handlePong() {
  dbg.log("Alerts:pong", "Received pong.");
  // Do nothing
}

export function handleReact(app, payload) {
  dbg.log("Alerts:react", "Received react alert", payload);
  
  const currentDomain = app.selectedDomainName()?.toLowerCase();
  const alertDomain = payload?.domain?.toLowerCase();

  if (alertDomain === currentDomain) {
    // Pass the nested 'data' object, which contains the BCM_React struct
    // that components are expecting.
    app.setPostUpdate(payload.data);
  } else {
    dbg.log("Alerts:react", `Ignoring react alert for different domain. App: ${currentDomain}, Alert: ${alertDomain}`);
  }
}