// src/alerts/registry.js
import * as h from "./handlers.js";
import * as bh from "./ban_handlers.js";


/**
 * A map of WebSocket alert types to their handler functions.
 * The AlertManager uses this to delegate incoming messages.
 */
export const alertRegistry = {
  token_price_changed: h.handleTokenPriceChanged,
  content_processed: h.handleContentProcessed,
  ping: h.handlePing,
  pong: h.handlePong,
  react: h.handleReact,
  comment_counter: h.handleCommentCounterUpdate,
  user_info_changed: h.handleUserInfoChanged,
  fund_contributed: h.handleFundContributed,
  fund_prize: h.handleFundPrize,
  fundraiser_contribution: h.handleFundraiserContribution,

  banned_post: bh.handleBannedPost,
  banned_user: bh.handleBannedUser,
  unbanned_post: bh.handleUnbannedPost,
  unbanned_user: bh.handleUnbannedUser,

  list_updated: h.handleListUpdated,

};
