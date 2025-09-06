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
