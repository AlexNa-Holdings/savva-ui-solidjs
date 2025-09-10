// src/x/modals/NewVersionModal.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ModalBackdrop from "./ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

export default function NewVersionModal(props) {
  const { t } = useApp();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <ModalBackdrop />
          <div class="relative z-[2001] themed-dialog rounded-lg shadow-lg w-full max-w-sm p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] text-center">
            <h3 class="text-lg font-semibold mb-2">{t("version.new.title")}</h3>
            <p class="text-sm text-[hsl(var(--muted-foreground))] mb-4">
              {t("version.new.message")}
            </p>
            <div class="flex justify-center">
              <button
                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={handleRefresh}
              >
                {t("version.new.refresh")}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}