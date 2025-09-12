// src/blockchain/adminCommands.js
import { sendAsUser } from "./npoMulticall.js";
import { toChecksumAddress } from "./utils.js";

// Pick canonical domain from /info (fallback to selected)
function domainFromApp(app) {
  try {
    const cfg = app.config?.();
    if (cfg?.domain) return cfg.domain; // set from /info loader
  } catch {}
  try {
    return app.selectedDomainName?.() || "";
  } catch {}
  return "";
}

/**
 * Low-level generic admin dispatcher: ContentRegistry.command(domain, cmd, p1..p4)
 * All params are strings; empty strings are OK.
 */
export async function sendAdminCommand(app, { cmd, p1 = "", p2 = "", p3 = "", p4 = "" }) {
  const domain = String(domainFromApp(app) || "");
  if (!cmd) throw new Error("cmd is required");

  // Always "as user" so msg.sender is admin EOA
  return await sendAsUser(app, {
    contractName: "ContentRegistry",
    functionName: "command",
    args: [domain, String(cmd), String(p1), String(p2), String(p3), String(p4)],
  });
}

/** Ban a post: p1 = savva_cid (string), p2 = comment (optional) */
export async function banPost(app, { savvaCid, comment = "" }) {
  if (!savvaCid) throw new Error("savvaCid is required");
  return await sendAdminCommand(app, { cmd: "ban_post", p1: String(savvaCid), p2: String(comment) });
}

/** Ban a user: p1 = author_addr (EIP-55 string), p2 = comment (optional) */
export async function banUser(app, { authorAddress, comment = "" }) {
  if (!authorAddress) throw new Error("authorAddress is required");
  const addr = toChecksumAddress(authorAddress); // standard Ethereum formatting
  return await sendAdminCommand(app, { cmd: "ban_user", p1: addr, p2: String(comment) });
}
