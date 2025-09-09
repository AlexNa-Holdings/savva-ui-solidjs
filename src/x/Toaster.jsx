// src/x/Toaster.jsx
import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useApp } from "../context/AppContext.jsx";
import { toasts, dismissToast, toggleToast } from "../ui/toast.js";

const typeStyles = {
  info:    "bg-blue-600",
  success: "bg-emerald-600",
  warning: "bg-amber-600",
  error:   "bg-red-600",
};

function pretty(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch {}
}

export default function Toaster() {
  const app = useApp();
  const { t } = app;

  return (
    <div class="fixed inset-x-0 bottom-0 z-[1000] p-3 pointer-events-none">
      <div class="flex flex-col gap-2 items-end">
        <For each={toasts()}>
          {(toast) => {
            const headerColor = typeStyles[toast.type] || typeStyles.info;

            return (
              <div
                class={`pointer-events-auto w-full ${toast.expanded ? "" : "sm:w-[28rem] max-w-[96vw]"}`}
              >
                <div class="rounded shadow overflow-hidden text-[hsl(var(--card-foreground))]">
                  <div class={`flex items-center gap-2 px-3 py-2 ${headerColor} text-white`}>
                    <span class="text-sm font-medium min-w-0 flex-1 truncate" title={String(toast.message || "")}>
                      {toast.message}
                    </span>
                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={toast.details}>
                        <button type="button" class="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-xs" onClick={() => toggleToast(toast.id)} aria-expanded={toast.expanded} title={toast.expanded ? t("ui.toast.hideDetails") : t("ui.toast.showDetails")}>
                          {toast.expanded ? t("ui.toast.hide") : t("ui.toast.details")}
                        </button>
                        <button type="button" class="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-xs" onClick={() => copy(pretty(toast.details))} title={t("ui.toast.copyDetails")}>
                          {t("common.copy")}
                        </button>
                      </Show>
                      <button type="button" class="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-xs" onClick={() => dismissToast(toast.id)} title={t("common.close")} aria-label={t("common.close")}>
                        ×
                      </button>
                    </div>
                  </div>
                  <div class="bg-[hsl(var(--card))]">
                    <Show when={toast.bodyComponent}>
                      <Dynamic component={toast.bodyComponent} {...toast.bodyProps} toast={toast} />
                    </Show>
                    <Show when={!toast.bodyComponent && toast.expanded && toast.details}>
                      <div class="px-3 py-2 text-xs" style={{ "max-height": "40vh", "overflow": "auto" }}>
                        <pre class="whitespace-pre-wrap leading-snug">{pretty(toast.details)}</pre>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

