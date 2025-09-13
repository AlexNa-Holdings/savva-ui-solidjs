// src/alerts/ban_handlers.js
// Calls app.setPostUpdate(...) for the four ban/unban BCMs.
import { dbg } from "../utils/debug.js";

// Accepts either (app, alert) or (alert); pulls payload from alert.data
function getCtxAndData(args) {
  const maybeApp = args[0];
  const maybeAlert = args[1] ?? args[0] ?? {};
  const app =
    maybeApp && typeof maybeApp.setPostUpdate === "function"
      ? maybeApp
      : maybeApp?.app && typeof maybeApp.app.setPostUpdate === "function"
      ? maybeApp.app
      : null;
  const data = (maybeAlert && maybeAlert.data) || maybeAlert || {};
  return { app, data };
}

const cidOf = (p) =>
  p?.savva_cid || p?.SavvaCID || p?.post?.savva_cid || p?.post?.id || null;

const authorAddrOf = (p) =>
  (p?.user?.address || p?.User?.address || p?.address || "").toLowerCase();

export function handleBannedPost(...args) {
  const { app, data } = getCtxAndData(args);
  if (!app) return;
  const cid = cidOf(data);
  if (!cid) {
    dbg?.warn?.("handleBannedPost: missing savva_cid", data);
    return;
  }
  app.setPostUpdate?.({
    type: "postBanned",
    cid,
    data: { post: data.post || null, comment: data.comment || "" },
  });
}

export function handleUnbannedPost(...args) {
  const { app, data } = getCtxAndData(args);
  if (!app) return;
  const cid = cidOf(data);
  if (!cid) {
    dbg?.warn?.("handleUnbannedPost: missing savva_cid", data);
    return;
  }
  app.setPostUpdate?.({
    type: "postUnbanned",
    cid,
    data: { post: data.post || null },
  });
}

export function handleBannedUser(...args) {
  const { app, data } = getCtxAndData(args);
  if (!app) return;
  const addr = authorAddrOf(data);
  if (!addr) {
    dbg?.warn?.("handleBannedUser: missing user.address", data);
    return;
  }
  app.setPostUpdate?.({
    type: "authorBanned",
    author: addr,
    data: { comment: data.comment || "" },
  });
}

export function handleUnbannedUser(...args) {
  const { app, data } = getCtxAndData(args);
  if (!app) return;
  const addr = authorAddrOf(data);
  if (!addr) {
    dbg?.warn?.("handleUnbannedUser: missing user.address", data);
    return;
  }
  app.setPostUpdate?.({
    type: "authorUnbanned",
    author: addr,
  });
}
