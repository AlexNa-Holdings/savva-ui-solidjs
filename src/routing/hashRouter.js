import { createSignal, onCleanup, onMount } from "solid-js";

function readHashPath() {
  const raw = window.location.hash || "";
  return raw.replace(/^#/, "") || "/";
}

const [route, setRoute] = createSignal(readHashPath());

function setFromHash() {
  setRoute(readHashPath());
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (replace) window.location.replace(target);
  else window.location.hash = path.startsWith("#") ? path.slice(1) : path;
}

export function useHashRouter() {
  onMount(() => {
    window.addEventListener("hashchange", setFromHash);
  });
  onCleanup(() => {
    window.removeEventListener("hashchange", setFromHash);
  });
  return { route, navigate };
}
