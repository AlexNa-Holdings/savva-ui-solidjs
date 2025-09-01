// src/alerts/handlers.js
import { dbg } from "../utils/debug";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../editor/storage.js";
import { pushToast } from "../ui/toast";

export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload.data);
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
  
  if (!isAlreadyVisible && content.content_type === 'post') {
    app.setNewContentAvailable(content);
  }
}

export function handleCommentCounterUpdate(app, payload) {
    dbg.log("Alerts:comment_counter", "Received comment counter alert", payload);
    const { savva_cid, n } = payload.data || {};
    if (!savva_cid) return;

    app.setPostUpdate({
        cid: savva_cid,
        type: 'commentCountChanged',
        data: {
            newTotal: n,
        }
    });
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
    const d = payload.data;
    // Emit a specific event with only the changed data
    app.setPostUpdate({
      cid: d?.object_id,
      type: 'reactionsChanged',
      data: {
        reactions: d?.reactions,
        reaction: d?.reaction,
        user: d?.user?.address,
      }
    });
  } else {
    dbg.log("Alerts:react", `Ignoring react alert for different domain. App: ${currentDomain}, Alert: ${alertDomain}`);
  }
}

export function handleUserInfoChanged(app, payload) {
  try {
    const u = payload?.user || payload?.data?.user;
    const addr = String(u?.address || "").toLowerCase();
    if (!addr) return;

    const names = u.display_names || {};
    if (names && typeof names === "object") {
      app.setUserDisplayNames?.(addr, names);
      dbg.log("Alerts:user_info_changed", "display_names updated", { addr, names });
    }
  } catch (e) {
    dbg.warn?.("Alerts:user_info_changed", "failed to handle", e);
  }
}