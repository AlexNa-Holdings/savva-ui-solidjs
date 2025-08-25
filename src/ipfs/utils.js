// src/ipfs/utils.js

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
 * Resolves a relative path from a post's content folder into a full IPFS path.
 * @param {object} post - The raw post object from the API.
 * @param {string} relativePath - The relative path within the content folder (e.g., "thumbnail.jpg").
 * @returns {string|null} The full, resolvable IPFS path (e.g., "bafy.../thumbnail.jpg").
 */
export function resolvePostCidPath(post, relativePath) {
  if (!relativePath) return null;
  const baseCid = getPostContentBaseCid(post);
  if (!baseCid) return null;
  
  const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
  return `${baseCid}/${cleanRelativePath}`;
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