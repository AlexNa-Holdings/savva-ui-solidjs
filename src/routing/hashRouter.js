// src/routing/hashRouter.js
import { createSignal } from "solid-js";
import { closeAllModals } from "../utils/modalBus.js";

function readHashPath() {
  const raw = window.location.hash || "";
  return raw.replace(/^#/, "") || "/";
}

const [route, setRoute] = createSignal(readHashPath());

function setFromHash() {
  // Close modals on any hash change (e.g., plain anchors)
  closeAllModals();
  setRoute(readHashPath());
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", setFromHash);
}

export function navigate(path, { replace = false } = {}) {
  // Close modals on programmatic navigation too
  closeAllModals();
  const target = path.startsWith("#") ? path : `#${path}`;
  if (replace) window.location.replace(target);
  else window.location.hash = path.startsWith("#") ? path.slice(1) : path;
}

export function useHashRouter() {
  return { route, navigate };
}
