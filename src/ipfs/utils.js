// src/ipfs/utils.js

/**
 * Checks if a string looks like a v0 or v1 IPFS CID.
 * This is a basic prefix/length check, not a full validation.
 * @param {string} s The string to check.
 * @returns {boolean}
 */
function isIpfsCid(s) {
  if (typeof s !== 'string') return false;
  // v0 CIDs start with "Qm" and are 46 characters long.
  if (s.startsWith('Qm') && s.length === 46) {
    return true;
  }
  // v1 CIDs in base32 commonly start with "bafy".
  if (s.startsWith('bafy')) {
    return true;
  }
  return false;
}

/**
 * Determines the base CID for a post's content, supporting both new and legacy formats.
 * @param {object} post - The raw post object from the API.
 * @returns {string|null} The base CID for the content folder.
 */
export function getPostContentBaseCid(post) {
  if (!post) return null;
  // New format: data_cid is nested in savva_content.
  if (post.savva_content?.data_cid) {
    return post.savva_content.data_cid;
  }
  // Legacy format: the top-level ipfs field is the base CID.
  return post.ipfs?.split('/')[0] || null;
}

/**
 * Resolves a path that may be relative to a post's content folder into a full IPFS path.
 * If the path already starts with any valid IPFS CID, it's returned as is.
 * Otherwise, it's treated as a relative path and the post's base CID is prepended.
 * @param {object} post - The raw post object from the API.
 * @param {string} path - The relative path or full CID path.
 * @returns {string|null} The full, resolvable IPFS path.
 */
export function resolvePostCidPath(post, path) {
  if (!path) return null;

  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const firstSegment = cleanPath.split('/')[0];

  // If the path already starts with any valid CID, treat it as absolute.
  if (isIpfsCid(firstSegment)) {
    return cleanPath;
  }

  // Otherwise, resolve it against the post's own base CID.
  const baseCid = getPostContentBaseCid(post);
  if (!baseCid) return null; // Cannot resolve a relative path without a base CID

  return `${baseCid}/${cleanPath}`;
}

/**
 * Determines the full IPFS path to a post's descriptor file (info.yaml),
 * supporting both new and legacy formats.
 * @param {object} post - The raw post object from the API.
 * @returns {string|null} The full, resolvable IPFS path to the descriptor.
 */
export function getPostDescriptorPath(post) {
  if (!post || !post.ipfs) return null;
  
  // If data_cid is in savva_content, it's the new format where `ipfs` is the direct path.
  if (post.savva_content?.data_cid) {
    return post.ipfs;
  }
  
  // Otherwise, it's the legacy format where `ipfs` is the folder CID.
  const baseCid = post.ipfs.split('/')[0];
  return `${baseCid}/info.yaml`;
}