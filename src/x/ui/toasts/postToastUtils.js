// src/x/ui/toasts/postToastUtils.js

/**
 * Safely extracts a localized string from a multi-language object.
 * Falls back to English and finally the first available value.
 */
export function getLocalizedField(multiString, lang) {
  if (!multiString) return "";
  if (typeof multiString === "string") return multiString;
  if (typeof multiString !== "object") return "";

  const normLang = String(lang || "").trim().toLowerCase();
  if (normLang && typeof multiString[normLang] === "string") {
    return multiString[normLang];
  }
  if (typeof multiString.en === "string") return multiString.en;

  for (const value of Object.values(multiString)) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (typeof value === "number") return value === 1;
  return false;
}

function hasEncryptionObject(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

/**
 * Attempts to detect whether an alert payload references an encrypted post.
 * The backend field names are not perfectly consistent yet, so we check the
 * commonly used variations to be tolerant of payload shape changes.
 */
export function isPostEncryptedAlert(payload) {
  if (!payload || typeof payload !== "object") return false;

  const checks = [
    payload.encrypted,
    payload.is_encrypted,
    payload.content_encrypted,
    payload.contentEncrypted,
    payload?.content?.encrypted,
    payload?.content?.is_encrypted,
    payload?.post?.encrypted,
    payload?.post?.is_encrypted,
    payload?.post?.content_encrypted,
    payload?.post?.contentEncrypted,
    payload?.post?.savva_content?.encrypted,
    payload?.savva_content?.encrypted,
  ];
  if (checks.some(isTruthyFlag)) return true;

  if (
    hasEncryptionObject(payload.encryption) ||
    hasEncryptionObject(payload?.content?.encryption) ||
    hasEncryptionObject(payload?.post?.encryption) ||
    hasEncryptionObject(payload?.post?.savva_content?.encryption) ||
    hasEncryptionObject(payload?.savva_content?.encryption)
  ) {
    return true;
  }

  return false;
}

function encryptedTitleFallback(t) {
  return (typeof t === "function" && t("post.encrypted.title")) || "Encrypted Content";
}

function encryptedPreviewFallback(t) {
  return (typeof t === "function" && t("post.encrypted.description")) || "This post is encrypted.";
}

function untitledFallback(t) {
  return (typeof t === "function" && t("main.tabs.untitled")) || "Untitled";
}

/**
 * Returns the string we should display in toast UIs for a post title.
 * If the payload is encrypted the placeholder is returned even if a title exists.
 */
export function selectPostToastTitle(payload, lang, t) {
  if (isPostEncryptedAlert(payload)) return encryptedTitleFallback(t);

  const title = getLocalizedField(payload?.title, lang).trim();
  return title || untitledFallback(t);
}

/**
 * Returns the string we should display in toast UIs for a post preview/snippet.
 * When the post is encrypted we prefer a generic encrypted placeholder text.
 */
export function selectPostToastPreview(payload, lang, t) {
  if (isPostEncryptedAlert(payload)) return encryptedPreviewFallback(t);

  const preview =
    getLocalizedField(payload?.preview, lang) ||
    getLocalizedField(payload?.text_preview, lang) ||
    getLocalizedField(payload?.summary, lang);

  return (preview && preview.trim()) || "";
}
