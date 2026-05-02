// src/lib/seo/headManager.js
//
// Tiny signal-driven head manager. Pages call useMeta(fn) where fn returns
// either null (entity not loaded yet — leave head alone) or a meta object.
// Tags it creates carry data-managed-seo="1" so they can be removed cleanly
// when an entity page unmounts (so the next non-entity route doesn't inherit
// stale canonical/og:* values).
//
// Recognised meta keys:
//   title, description, canonical, image,
//   ogType, twitterCard, siteName, locale, robots
//
// A null/empty value removes the corresponding managed tag (so clearing a
// field does not leave stale state).

import { createEffect, onCleanup } from "solid-js";

const VALUE_ATTR = { meta: "content", link: "href" };

function upsert(tagName, keyAttr, keyValue, value) {
  const selector = `${tagName}[${keyAttr}="${keyValue}"]`;
  let el = document.head.querySelector(selector);
  const isManaged = el?.dataset?.managedSeo === "1";

  if (value == null || value === "") {
    if (el && isManaged) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement(tagName);
    el.setAttribute(keyAttr, keyValue);
    el.dataset.managedSeo = "1";
    document.head.appendChild(el);
  }
  el.setAttribute(VALUE_ATTR[tagName], String(value));
}

export function setMeta(meta) {
  if (!meta) return;
  const {
    title, description, canonical, image,
    ogType, twitterCard, siteName, locale, robots,
  } = meta;

  if (title != null && title !== "") document.title = title;

  upsert("meta", "property", "og:title", title);
  upsert("meta", "name", "twitter:title", title);

  upsert("meta", "name", "description", description);
  upsert("meta", "property", "og:description", description);
  upsert("meta", "name", "twitter:description", description);

  upsert("link", "rel", "canonical", canonical);
  upsert("meta", "property", "og:url", canonical);

  upsert("meta", "property", "og:image", image);
  upsert("meta", "name", "twitter:image", image);

  upsert("meta", "property", "og:type", ogType);
  upsert("meta", "name", "twitter:card", twitterCard);
  upsert("meta", "property", "og:site_name", siteName);
  upsert("meta", "property", "og:locale", locale);
  upsert("meta", "name", "robots", robots);
}

export function clearManagedMeta() {
  document.head
    .querySelectorAll('[data-managed-seo="1"]')
    .forEach((el) => el.remove());
}

// Reactive entry point for components. fn() may return null while the entity
// is still loading; once it returns an object we apply it. On component
// unmount we strip every managed tag so a non-entity route lands with a
// clean head (AppContext re-applies the locale-default title separately).
export function useMeta(fn) {
  createEffect(() => {
    const m = fn();
    if (m) setMeta(m);
  });
  onCleanup(clearManagedMeta);
}
