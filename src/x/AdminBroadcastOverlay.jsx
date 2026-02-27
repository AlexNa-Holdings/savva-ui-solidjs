// src/x/AdminBroadcastOverlay.jsx
import { Show } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import Modal from "./modals/Modal.jsx";

export default function AdminBroadcastOverlay() {
  const app = useApp();
  const { t } = app;

  const message = () => app.adminBroadcastMessage();

  const handleDismiss = () => {
    app.setAdminBroadcastMessage(null);
  };

  return (
    <Show when={message()}>
      <Modal
        isOpen={!!message()}
        onClose={handleDismiss}
        title={t("admin.broadcast.overlay.title")}
        size="md"
        footer={
          <div class="flex justify-end py-1">
            <button
              type="button"
              class="px-4 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
              onClick={handleDismiss}
            >
              {t("admin.broadcast.overlay.dismiss")}
            </button>
          </div>
        }
      >
        <div class="py-2">
          <div class="flex items-start gap-3">
            <svg class="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <p class="text-sm text-[hsl(var(--foreground))] whitespace-pre-wrap break-words">
              {message()}
            </p>
          </div>
        </div>
      </Modal>
    </Show>
  );
}
