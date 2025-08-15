// src/components/Toaster.jsx
import { For, Show } from "solid-js";
import { toasts, dismissToast, toggleToast } from "../ux/toast";

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
  return (
    // Full-width bottom bar container; toasts align right when compact.
    // We disable pointer events on the container so it doesn't block the page,
    // and re-enable them on each toast.
    <div class="fixed inset-x-0 bottom-0 z-[1000] p-3 pointer-events-none">
      <div class="flex flex-col gap-2 items-end">
        <For each={toasts()}>
          {(t) => {
            const headerColor = typeStyles[t.type] || typeStyles.info;
            return (
              // When expanded: stretch to full width; when compact: hug right (max ~28rem)
              <div
                class={`pointer-events-auto w-full ${
                  t.expanded ? "" : "sm:w-[28rem] max-w-[92vw]"
                }`}
              >
                <div class="text-white rounded shadow overflow-hidden">
                  {/* Header bar */}
                  <div class={`flex items-center justify-between px-3 py-2 ${headerColor}`}>
                    <span class="text-sm font-medium">{t.message}</span>
                    <div class="flex items-center gap-1">
                      <Show when={t.details}>
                        <button
                          class="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-xs"
                          onClick={() => toggleToast(t.id)}
                          aria-expanded={t.expanded}
                          title={t.expanded ? "Hide details" : "Show details"}
                        >
                          {t.expanded ? "Hide" : "Details"}
                        </button>
                      </Show>
                      <button
                        class="px-2 py-1 rounded bg-black/20 hover:bg-black/30"
                        onClick={() => dismissToast(t.id)}
                        aria-label="Close notification"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Details panel — takes full width, tall & scrollable */}
                  <Show when={t.expanded && t.details}>
                    <div class="bg-gray-900 text-gray-100 px-4 py-3 max-h-[60vh] overflow-auto">
                      <pre class="whitespace-pre-wrap break-words text-[12px] leading-tight">
{pretty(t.details)}
                      </pre>
                      <div class="mt-2 flex justify-end">
                        <button
                          class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs"
                          onClick={() => copy(pretty(t.details))}
                          title="Copy details to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
