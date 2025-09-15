// src/routing/navigateBack.js
let _stack = [];
let _mainRoute = "/";

const MAX_STACK = 200;

function norm(path) {
  let p = String(path || "/");
  if (p.startsWith("#")) p = p.slice(1);
  if (!p.startsWith("/")) p = "/" + p;
  return p;
}

function currentPath() {
  const h = typeof window !== "undefined" ? window.location.hash : "";
  const raw = h ? h.slice(1) : "/";
  return norm(raw);
}

function pushRoute(path) {
  const p = norm(path ?? currentPath());
  if (_stack.length === 0 || _stack[_stack.length - 1] !== p) {
    _stack.push(p);
    if (_stack.length > MAX_STACK) _stack = _stack.slice(-MAX_STACK);
  }
}

if (typeof window !== "undefined") {
  pushRoute(currentPath());
  window.addEventListener("hashchange", () => pushRoute(), { passive: true });
}

export function setMainRoute(route) {
  _mainRoute = norm(route || "/");
}

export function getNavHistory() {
  return [..._stack];
}

function defaultIsPostRoute(p) {
  // Heuristics for post pages; adjust as needed
  return (
    /^\/post(\/|$)/.test(p) ||
    /^\/p(\/|$)/.test(p) ||
    /^\/thread(\/|$)/.test(p) ||
    /^\/content(\/|$)/.test(p)
  );
}

/**
 * Smart back navigation.
 * @param {'page'|'main'|'post'} mode
 * @param {{ navigate?: (to:string)=>void, mainRoute?: string, isPost?: (path:string)=>boolean }} [opts]
 */
export default function NavigateBack(mode = "page", opts = {}) {
  const navigate = typeof opts.navigate === "function" ? opts.navigate : null;
  const main = norm(opts.mainRoute || _mainRoute || "/");
  const cur = currentPath();
  const isPost = typeof opts.isPost === "function" ? opts.isPost : defaultIsPostRoute;

  const go = (to) => {
    const dest = norm(to || main);
    if (dest === cur) return;
    if (navigate) navigate(dest);
    else if (typeof window !== "undefined") window.location.hash = "#" + dest;
  };

  if (mode === "main") {
    go(main);
    return;
  }

  // Find last main index to not jump past it
  let lastMainIdx = -1;
  for (let i = _stack.length - 1; i >= 0; i--) {
    if (_stack[i] === main) {
      lastMainIdx = i;
      break;
    }
  }

  if (mode === "post") {
    // Go back until we hit a post page; fallback to main.
    for (let i = _stack.length - 2; i >= 0; i--) {
      const p = _stack[i];
      if (p === cur) continue;
      if (i <= lastMainIdx) {
        go(main);
        return;
      }
      if (isPost(p)) {
        go(p);
        return;
      }
    }
    go(main);
    return;
  }

  // mode === 'page': go to the most recent prior page, but never past main.
  for (let i = _stack.length - 2; i >= 0; i--) {
    const p = _stack[i];
    if (p === cur) continue;
    if (i <= lastMainIdx) {
      go(main);
      return;
    }
    go(p);
    return;
  }

  go(main || "/");
}
