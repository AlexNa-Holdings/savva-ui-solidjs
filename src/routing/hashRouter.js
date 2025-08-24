// src/routing/hashRouter.js
import { createSignal } from "solid-js";

function readHashPath() {
  const raw = window.location.hash || "";
  return raw.replace(/^#/, "") || "/";
}

const [route, setRoute] = createSignal(readHashPath());

function setFromHash() {
  const newPath = readHashPath();
  setRoute(newPath);
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", setFromHash);
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (replace) window.location.replace(target);
  else window.location.hash = path.startsWith("#") ? path.slice(1) : path;
}

export function useHashRouter() {
  return { route, navigate };
}