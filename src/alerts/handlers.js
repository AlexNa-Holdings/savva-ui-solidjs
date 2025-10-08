// src/alerts/handlers.js
import { dbg } from "../utils/debug";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../editor/storage.js";
import { pushToast } from "../ui/toast";
import ContributionToast from "../x/ui/toasts/ContributionToast.jsx";
import { formatUnits } from "viem";
import FundraiserContributionToast from "../x/ui/toasts/FundraiserContributionToast.jsx";

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
    window.dispatchEvent(new Event("savva:claimable-refresh"));
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

export function handleFundraiserContribution(app, payload) {
  const data = payload.data;
  dbg.log("Alerts:fundraiser_contribution", data);

  if (!data || !data.id) return;

  // Trigger UI updates for fundraising components
  app.triggerFundraiserUpdate?.();

  // Show a toast
  pushToast({
    type: "info",
    message: app.t("alerts.fundraiser_contribution.title"),
    autohideMs: 10000,
    bodyComponent: FundraiserContributionToast,
    bodyProps: { data },
  });
}

export function handleListUpdated(app, payload) {
  try {
    dbg.log("Alerts:list_updated", payload);

    // Optional: ignore if broadcast domain (when present) doesn't match current app domain
    const currentDomain = app.selectedDomainName?.()?.toLowerCase?.();
    const alertDomain = String(
      payload?.domain || payload?.data?.domain || ""
    ).toLowerCase();
    if (alertDomain && currentDomain && alertDomain !== currentDomain) {
      dbg.log(
        "Alerts:list_updated",
        `Ignoring alert for different domain. App: ${currentDomain}, Alert: ${alertDomain}`
      );
      return;
    }

    // Be tolerant to different payload shapes
    const list = String(
      payload?.list ??
        payload?.data?.list ??
        payload?.list_id ??
        payload?.data?.list_id ??
        payload?.List ??
        payload?.data?.List ??
        ""
    ).trim();

    if (!list) return;

    // Generic broadcast consumed by widgets (e.g., ContentListBlock)
    try {
      window.dispatchEvent(
        new CustomEvent("savva:ws-broadcast", {
          detail: { type: "list_updated", payload: { list } },
        })
      );
    } catch {}

    // Convenience event for direct listeners
    try {
      window.dispatchEvent(
        new CustomEvent("savva:list-updated", { detail: { list } })
      );
    } catch {}
  } catch (e) {
    dbg.warn?.("Alerts:list_updated", "failed to handle", e);
  }
}

export function handleError(app, payload) {
  try {
    dbg.log("Alerts:error", payload);

    const data = payload?.data || {};
    const user = data?.user;
    const errorMessage = data?.error || payload?.error || "";

    if (!user?.address) {
      dbg.log("Alerts:error", "No user address in error payload, ignoring");
      return;
    }

    // Normalize addresses for comparison
    const errorUserAddress = String(user.address).toLowerCase();
    const authorizedUserAddress = String(app.authorizedUser?.()?.address || "").toLowerCase();

    // Check if the error is for the current user
    const isCurrentUser = errorUserAddress === authorizedUserAddress;

    // Check if the error is for one of the user's NPO addresses
    let isUserNpo = false;
    const npoMemberships = app.npoMemberships?.() || [];
    if (npoMemberships.length > 0) {
      isUserNpo = npoMemberships.some(
        (npo) => String(npo.address || "").toLowerCase() === errorUserAddress
      );
    }

    // Only show toast if it's the current user or one of their NPOs
    if (!isCurrentUser && !isUserNpo) {
      dbg.log(
        "Alerts:error",
        `Error is for different user (${errorUserAddress}), ignoring`
      );
      return;
    }

    // Build detailed error message
    let details = errorMessage;
    if (data.type) {
      details = `Type: ${data.type}\n${details}`;
    }
    if (user.name) {
      details = `User: ${user.name} (${user.address})\n${details}`;
    }

    pushToast({
      type: "error",
      message: "Error Processing Content",
      details: details || "An unknown error occurred",
      autohideMs: 15000,
    });

    dbg.log("Alerts:error", "Displayed error toast for user", {
      user: user.address,
      isCurrentUser,
      isUserNpo,
    });
  } catch (e) {
    dbg.warn?.("Alerts:error", "failed to handle error alert", e);
  }
}
