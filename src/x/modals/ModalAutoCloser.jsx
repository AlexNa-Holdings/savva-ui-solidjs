// src/x/modals/ModalAutoCloser.jsx
// src/x/modals/ModalAutoCloser.jsx
import { onMount, onCleanup, createEffect } from "solid-js";
import { onCloseAllModals, markModalOpen, markModalClosed } from "../../utils/modalBus.js";
import { useHashRouter } from "../../routing/hashRouter.js";

export default function ModalAutoCloser(props) {
  const { route } = useHashRouter();
  const start = route();
  const close = () => props.onClose?.();

  let off;
  onMount(() => {
    markModalOpen();
    off = onCloseAllModals(close);
  });
  onCleanup(() => {
    if (off) off();
    markModalClosed();
  });

  // Safety net: close if route changes anyway
  createEffect(() => { if (route() !== start) close(); });

  return null;
}
