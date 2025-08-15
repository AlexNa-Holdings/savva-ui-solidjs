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
    // bottom-right placement
    <div class="fixed bottom-3 right-3 z-[1000] space-y-2 max-w-[92vw] sm:max-w-[28rem]">
      <For each={toasts()}>
        {(t) => (
          <div
            class={`text-white rounded shadow overflow-hidden`}
            role="status"
          >
            {/* Header bar */}
            <div class={`flex items-center justify-between px-3 py-2 ${typeStyles[t.type] || typeStyles.info}`}>
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

            {/* Details panel */}
            <Show when={t.expanded && t.details}>
              <div class="bg-gray-900 text-gray-100 px-3 py-2">
                <pre class="whitespace-pre-wrap break-words text-[11px] leading-tight">
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
        )}
      </For>
    </div>
  );
}
