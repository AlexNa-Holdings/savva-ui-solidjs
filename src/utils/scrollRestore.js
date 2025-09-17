// src/utils/scrollRestore.js
export function restoreWindowScrollY(targetY, opts = {}) {
  const y = Number.isFinite(targetY) ? Math.max(0, targetY) : 0;
  if (y <= 0) return () => {};

  const maxAttempts = Math.max(1, opts.maxAttempts ?? 40);
  const interval    = Math.max(16, opts.interval ?? 60);
  const margin      = Math.max(0, opts.margin ?? 24);

  let canceled = false;
  let attempts = 0;

  const el = () => document.scrollingElement || document.documentElement;
  const minHeight = () =>
    (typeof opts.minHeight === "function" ? opts.minHeight() : opts.minHeight)
    ?? (y + window.innerHeight - margin);

  function tick() {
    if (canceled) return;
    window.scrollTo(0, y);
    const tallEnough = el().scrollHeight >= minHeight();
    if (tallEnough || attempts >= maxAttempts) return;
    attempts += 1;
    setTimeout(tick, interval);
  }

  requestAnimationFrame(tick);
  return () => { canceled = true; };
}

export default restoreWindowScrollY;
