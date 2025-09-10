// src/x/ui/ConfirmModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import ModalAutoCloser from "../modals/ModalAutoCloser.jsx";
import ModalBackdrop from "../modals/ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

export default function ConfirmModal(props) {
  const { t } = useApp();

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-60 flex items-center justify-center">
          <ModalBackdrop onClick={props.onClose} />
          <div class="relative z-70 themed-dialog rounded-lg shadow-lg w-full max-w-md p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
            <ModalAutoCloser onClose={props.onClose} />
            <h3 class="text-lg font-semibold mb-2">{props.title}</h3>
            <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">{props.message}</p>
            <div class="flex gap-2 justify-end">
              <button
                class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
                onClick={props.onClose}
              >
                {props.cancelText || t("common.cancel")}
              </button>
              <button
                class="px-3 py-2 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
                onClick={() => {
                  props.onConfirm?.();
                  props.onClose?.();
                }}
              >
                {props.confirmText || t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
