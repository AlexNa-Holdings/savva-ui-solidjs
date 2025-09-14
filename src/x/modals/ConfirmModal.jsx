// src/x/ui/ConfirmModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import Modal from "./Modal.jsx";

export default function ConfirmModal(props) {
  const { t } = useApp();

  const title = () => props.title || t("common.confirm");
  const message = () => props.message || "";
  const cancelText = () => props.cancelText || t("common.cancel");
  const confirmText = () => props.confirmText || t("common.confirm");
  const confirmVariant = () => props.variant || "destructive"; // "destructive" | "primary"

  const confirmBtnClass = () =>
    confirmVariant() === "destructive"
      ? "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))]"
      : "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]";

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={title()}
      size={props.size || "md"}
      footer={
        <div class="flex gap-2 justify-end">
          <button
            class="px-3 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={props.onClose}
          >
            {cancelText()}
          </button>
          <button
            class={`px-3 py-2 rounded hover:opacity-90 ${confirmBtnClass()}`}
            onClick={() => {
              props.onConfirm?.();
              props.onClose?.();
            }}
          >
            {confirmText()}
          </button>
        </div>
      }
    >
      <Show when={message()}>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">{message()}</p>
      </Show>

      {/* Optional extra content (e.g., PostCard/UserCard) */}
      {props.children}
    </Modal>
  );
}
