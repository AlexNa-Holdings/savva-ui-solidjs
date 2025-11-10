// src/x/crypto/fetchParentPostEncryption.js

import { dbg } from "../../utils/debug.js";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { whenWsOpen } from "../../net/wsRuntime.js";

/**
 * Fetch encryption information from a parent post
 * @param {object} app - Application context
 * @param {string} rootSavvaCid - The root_savva_cid of the post to fetch
 * @returns {Promise<object|null>} - { recipients: Array<string>, postPublicKey: string } or null if not encrypted
 */
export async function fetchParentPostEncryption(app, rootSavvaCid) {
  try {
    dbg.log("fetchParentPostEncryption", `Fetching parent post: ${rootSavvaCid}`);

    await whenWsOpen();

    // Fetch the post metadata using content-list (same as fetchPostByIdentifier)
    const contentList = app.wsMethod?.("content-list");
    if (!contentList) {
      throw new Error("WebSocket method 'content-list' not available");
    }

    const requestParams = {
      domain: app.selectedDomainName?.() || "",
      lang: app.lang?.() || "en",
      limit: 1
    };

    if (rootSavvaCid.startsWith("0x")) {
      requestParams.savva_cid = rootSavvaCid;
    } else {
      requestParams.short_cid = rootSavvaCid;
    }

    const user = app.authorizedUser?.();
    if (user?.address) {
      requestParams.my_addr = toChecksumAddress(user.address);
    }

    const res = await contentList(requestParams);
    const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
    const postData = arr[0];

    if (!postData || !postData.ipfs) {
      dbg.warn("fetchParentPostEncryption", `Post ${rootSavvaCid} not found or has no IPFS path`);
      return null;
    }

    // Fetch the descriptor
    const { descriptor } = await fetchDescriptorWithFallback(app, postData);

    dbg.log("fetchParentPostEncryption", `Descriptor fetched for ${rootSavvaCid}`, {
      hasEncryption: !!descriptor.encryption,
      recipientCount: descriptor.encryption?.recipients ? Object.keys(descriptor.encryption.recipients).length : 0
    });

    // Check if the post has encryption
    if (!descriptor.encryption || !descriptor.encryption.recipients) {
      dbg.log("fetchParentPostEncryption", "Parent post is not encrypted");
      return null;
    }

    // Extract recipient addresses (keys of the recipients object)
    const recipients = Object.keys(descriptor.encryption.recipients);
    const postPublicKey = descriptor.encryption.key_exchange_pub_key;

    dbg.log("fetchParentPostEncryption", `Found ${recipients.length} recipients in parent post`);

    return {
      recipients,
      postPublicKey,
      encryptionType: descriptor.encryption.type,
    };
  } catch (error) {
    dbg.error("fetchParentPostEncryption", `Failed to fetch parent post encryption for ${rootSavvaCid}`, error);
    throw error;
  }
}
