// src/components/ui/ConfirmModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext";

export default function ConfirmModal(props) {
  const { t } = useApp();

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-md p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
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
    </Show>
  );
}
