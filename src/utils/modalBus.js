// src/utils/modalBus.js
// src/utils/modalBus.js
const EVT = "savva:close-all-modals";

export function closeAllModals() {
  // Broadcast to all open modals
  window.dispatchEvent(new CustomEvent(EVT));
}

export function onCloseAllModals(handler) {
  const h = () => handler?.();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// --- modal open tracking (for ESC handling) ---
let _openModals = 0;

export function markModalOpen() {
  _openModals++;
}

export function markModalClosed() {
  _openModals = Math.max(0, _openModals - 1);
}

export function isAnyModalOpen() {
  return _openModals > 0;
}
