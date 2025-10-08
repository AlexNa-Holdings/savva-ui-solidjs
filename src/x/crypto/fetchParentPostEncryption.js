// src/x/crypto/fetchParentPostEncryption.js

import { dbg } from "../../utils/debug.js";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";

/**
 * Fetch encryption information from a parent post
 * @param {object} app - Application context
 * @param {string} rootSavvaCid - The root_savva_cid of the post to fetch
 * @returns {Promise<object|null>} - { recipients: Array<string>, postPublicKey: string } or null if not encrypted
 */
export async function fetchParentPostEncryption(app, rootSavvaCid) {
  try {
    dbg.log("fetchParentPostEncryption", `Fetching parent post: ${rootSavvaCid}`);

    // Fetch the post metadata from WS API
    const getPost = app.wsMethod?.("get-post");
    if (!getPost) {
      throw new Error("WebSocket method 'get-post' not available");
    }

    const postData = await getPost({
      domain: app.selectedDomainName?.() || "",
      savva_cid: rootSavvaCid,
    });

    if (!postData || !postData.ipfs) {
      throw new Error(`Post ${rootSavvaCid} not found or has no IPFS path`);
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
