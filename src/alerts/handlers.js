// src/alerts/handlers.js
import { dbg } from "../utils/debug";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../editor/storage.js";
import { pushToast } from "../ui/toast";
import ContributionToast from "../x/ui/toasts/ContributionToast.jsx";
import { formatUnits } from "viem";

export function handleTokenPriceChanged(app, payload) {
  dbg.log("Alerts:token_price_changed", payload);
  app.updateTokenPrices?.(payload.data);
}

export async function handleContentProcessed(app, payload) {
  const { content } = payload.data || {};
  if (!content || !content.guid) {
    return;
  }

  dbg.log(
    "Alerts:content_processed",
    "Handler triggered with content:",
    content
  );

  const draftParams = await getDraftParams(DRAFT_DIRS.NEW_POST);
  if (draftParams && draftParams.guid === content.guid) {
    await clearDraft(DRAFT_DIRS.NEW_POST);
    pushToast({
      type: "success",
      message: app.t("editor.publish.draftCleared"),
    });
  }

  const currentItems = app.newFeedItems();
  const isAlreadyVisible = currentItems.some(
    (item) => item.id === content.savva_cid
  );

  if (!isAlreadyVisible && content.content_type === "post") {
    app.setNewContentAvailable(content);
  }
}

export function handleCommentCounterUpdate(app, payload) {
  dbg.log("Alerts:comment_counter", "Received comment counter alert", payload);
  const { savva_cid, n } = payload.data || {};
  if (!savva_cid) return;

  app.setPostUpdate({
    cid: savva_cid,
    type: "commentCountChanged",
    data: {
      newTotal: n,
    },
  });
}

export function handlePing(app) {
  app.ws?.sendJson({ type: "pong" });
}

export function handlePong() {
  // Do nothing
}

export function handleReact(app, payload) {
  dbg.log("Alerts:react", "Received react alert", payload);

  const currentDomain = app.selectedDomainName()?.toLowerCase();
  const alertDomain = payload?.domain?.toLowerCase();

  if (alertDomain === currentDomain) {
    const d = payload.data;
    app.setPostUpdate({
      cid: d?.object_id,
      type: "reactionsChanged",
      data: {
        reactions: d?.reactions,
        reaction: d?.reaction,
        user: d?.user?.address,
      },
    });
  } else {
    dbg.log(
      "Alerts:react",
      `Ignoring react alert for different domain. App: ${currentDomain}, Alert: ${alertDomain}`
    );
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
      dbg.log("Alerts:user_info_changed", "display_names updated", {
        addr,
        names,
      });
    }

    if (typeof u.avatar === "string") {
      app.setUserAvatar?.(addr, u.avatar);
      dbg.log("Alerts:user_info_changed", "avatar updated", {
        addr,
        avatar: u.avatar,
      });
    }

    const authorized = app.authorizedUser();
    if (authorized && String(authorized.address).toLowerCase() === addr) {
      app.updateAuthorizedUser?.(u);
      dbg.log(
        "Alerts:user_info_changed",
        "Authorized user data was updated with partial data:",
        u
      );
    }
  } catch (e) {
    dbg.warn?.("Alerts:user_info_changed", "failed to handle", e);
  }
}

function getLocalizedTitle(multiString, lang) {
  if (!multiString) return "";
  return (
    multiString[lang] || multiString.en || Object.values(multiString)[0] || ""
  );
}

export function handleFundContributed(app, payload) {
  const data = payload.data;
  dbg.log("Alerts:fund_contributed", data);

  if (!data || !data.content_id) return;

  app.setPostUpdate?.({
    cid: data.content_id,
    type: "fundChanged",
    data: {
      fund: {
        amount: data.amount,
        round_time: data.round_time,
        round_value: data.round_value,
      },
    },
  });

  pushToast({
    type: "info",
    message: app.t("alerts.fund_contributed.title"),
    autohideMs: 10000,
    bodyComponent: ContributionToast,
    bodyProps: { data },
  });
}

export function handleFundPrize(app, payload) {
  const data = payload.data;
  dbg.log("Alerts:fund_prize", data);

  if (!data || !data.content_id) return;

  app.setPostUpdate?.({
    cid: data.content_id,
    type: "fundChanged",
    data: {
      fund: {
        amount: data.amount,
        round_time: data.round_time,
        round_value: data.round_value,
      },
    },
  });

  pushToast({
    type: "success",
    message: app.t("alerts.fund_prize.title"),
    autohideMs: 15000,
    bodyComponent: PrizeToast,
    bodyProps: { data },
  });
}
