// src/components/editor/EditorFilesDrawer.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-6 h-6"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

export default function EditorFilesDrawer(props) {
  const { t } = useApp();

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-80 h-full bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg z-50 transition-transform duration-300 ${props.isOpen ? "translate-x-0" : "translate-x-full"}`}
        style="border-left: 1px solid hsl(var(--border));"
      >
        <div class="h-full flex flex-col">
          <header class="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
            <h3 class="font-semibold">{t("editor.sidebar.files")}</h3>
            <button
              onClick={props.onClose}
              class="p-1 rounded-full hover:bg-[hsl(var(--accent))]"
              aria-label={t("common.cancel")}
            >
              <CloseIcon />
            </button>
          </header>
          <div class="flex-1 p-4 overflow-y-auto">
            <div class="h-full flex items-center justify-center rounded-lg bg-[hsl(var(--muted))]">
              <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.filesPlaceholder")}</span>
            </div>
          </div>
        </div>
      </div>
      <Show when={props.isOpen}>
        <div
          class="fixed inset-0 z-40 bg-black/20"
          onClick={props.onClose}
        />
      </Show>
    </>
  );
}
