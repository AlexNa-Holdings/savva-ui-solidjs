// src/x/modals/ModalAutoCloser.jsx
import { onMount, onCleanup, createEffect } from "solid-js";
import { onCloseAllModals } from "../../utils/modalBus.js";
import { useHashRouter } from "../../routing/hashRouter.js";

export default function ModalAutoCloser(props) {
  const { route } = useHashRouter();
  const start = route();
  const close = () => props.onClose?.();

  let off;
  onMount(() => { off = onCloseAllModals(close); });
  onCleanup(() => off && off());

  // Safety net: close if route changes anyway
  createEffect(() => { if (route() !== start) close(); });

  return null;
}
