// src/x/modals/Modal.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ModalAutoCloser from "./ModalAutoCloser.jsx";
import ModalBackdrop from "./ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

export default function Modal(props) {
  const { t } = useApp();

  // xs, sm, md, lg, xl
  const maxW = createMemo(() => {
    switch ((props.size || "md").toLowerCase()) {
      case "xs": return "max-w-xs";
      case "sm": return "max-w-sm";
      case "lg": return "max-w-lg";
      case "xl": return "max-w-xl";
      case "2xl": return "max-w-2xl";
      case "3xl": return "max-w-3xl";
      case "4xl": return "max-w-4xl";
      case "5xl": return "max-w-5xl";
      case "6xl": return "max-w-6xl";
      case "7xl": return "max-w-7xl";
      case "full": return "max-w-full";
      default:   return "max-w-md";
    }
  });

  const showClose = props.showClose !== false; // default true

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 z-60 flex items-center justify-center">
          <ModalBackdrop onClick={props.preventClose ? undefined : props.onClose} />

          {/* wrapper shouldn't eat backdrop clicks */}
          <div class="relative z-70 p-4 pointer-events-none">
            <ModalAutoCloser onClose={props.onClose} />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={props.titleId}
              class={`mx-auto ${maxW()} ${props.minWClass || ""} rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg pointer-events-auto`}
              style={props.minWidth ? { "min-width": props.minWidth } : undefined}
            >
              {/* Header: either custom header, or default (title + optional hint + optional close) */}
              <Show when={props.header || props.title}>
                <div class="px-4 py-3 border-b border-[hsl(var(--border))]">
                  <Show when={props.header} fallback={
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h3 id={props.titleId} class="text-lg font-semibold truncate">{props.title}</h3>
                        <Show when={props.hint}>
                          <p class="mt-1 text-sm opacity-80">{props.hint}</p>
                        </Show>
                      </div>
                      <Show when={showClose}>
                        <button
                          type="button"
                          aria-label={t("common.close")}
                          class="ml-1 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md hover:bg-[hsl(var(--accent))]"
                          onClick={props.onClose}
                        >
                          <span class="text-xl leading-none">×</span>
                        </button>
                      </Show>
                    </div>
                  }>
                    {props.header}
                  </Show>
                </div>
              </Show>

              <div class={props.noPadding ? "" : "p-4"}>
                {typeof props.children === "function"
                  ? props.children({ close: props.onClose })
                  : props.children}
              </div>

              <Show when={props.footer}>
                <div class="px-4 py-1 border-t border-[hsl(var(--border))]">
                  {props.footer}
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
