// src/x/modals/Modal.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ModalAutoCloser from "./ModalAutoCloser.jsx";
import ModalBackdrop from "./ModalBackdrop.jsx";
import { Portal } from "solid-js/web";

export default function Modal(props) {
  const { t } = useApp();

  const sizeKey = createMemo(() => (props.size || "md").toLowerCase());
  const isFullscreen = createMemo(() => sizeKey() === "fullscreen");
  const isFullscreenPadded = createMemo(() => sizeKey() === "fullscreenpadded");
  const isFullscreenLike = createMemo(() => isFullscreen() || isFullscreenPadded());

  // Check if size ends with "-fixed" for fixed width
  const isFixed = createMemo(() => sizeKey().endsWith("-fixed"));
  const baseSizeKey = createMemo(() => isFixed() ? sizeKey().replace("-fixed", "") : sizeKey());

  // xs, sm, md, lg, xl
  const maxW = createMemo(() => {
    const size = baseSizeKey();

    // For fixed sizes, use actual pixel widths that match Tailwind's max-w-* values
    if (isFixed()) {
      switch (size) {
        case "xs": return "w-[20rem]"; // 320px
        case "sm": return "w-[24rem]"; // 384px
        case "md": return "w-[28rem]"; // 448px
        case "lg": return "w-[32rem]"; // 512px
        case "xl": return "w-[36rem]"; // 576px
        case "2xl": return "w-[42rem]"; // 672px
        case "3xl": return "w-[48rem]"; // 768px
        case "4xl": return "w-[56rem]"; // 896px
        case "5xl": return "w-[64rem]"; // 1024px
        case "6xl": return "w-[72rem]"; // 1152px
        case "7xl": return "w-[80rem]"; // 1280px
        case "full": return "w-full";
        default: return "w-[28rem]"; // 448px (md)
      }
    }

    // For responsive sizes, use max-w-*
    switch (size) {
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
      case "fullscreen": return "w-screen h-screen max-w-full rounded-none";
      case "fullscreenpadded": return "w-[95vw] h-[95vh] max-w-[95vw] max-h-[95vh]";
      default: return "max-w-md";
    }
  });

  const showClose = props.showClose !== false; // default true
  const hasCustomFooter = () => !!props.footer;
  const renderBottomClose = () => showClose && isFullscreenLike() && !hasCustomFooter();

  const chromeRounding = () => (isFullscreen() ? "" : "rounded-lg");

  const computedStyle = () => {
    const style = {};
    if (props.minWidth) style['min-width'] = props.minWidth;
    if (isFullscreen()) style.height = '100%';
    return Object.keys(style).length ? style : undefined;
  };

  const bodyClass = () => {
    const padding = props.noPadding ? '' : 'p-4';
    return isFullscreenLike() ? `${padding} flex-1 min-h-0 overflow-auto` : padding;
  };

  const containerAlignClass = () => (isFullscreen() ? "items-stretch" : "items-center");

  const wrapperClass = () =>
    isFullscreen()
      ? 'relative z-70 pointer-events-none h-full w-full'
      : 'relative z-70 pointer-events-none p-4';

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class={`fixed inset-0 z-60 flex justify-center ${containerAlignClass()}`}>
          <ModalBackdrop onClick={props.preventClose ? undefined : props.onClose} />

          {/* wrapper shouldn't eat backdrop clicks */}
          <div class={wrapperClass()}>
            <ModalAutoCloser onClose={props.onClose} />

            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={props.titleId}
              class={`mx-auto ${maxW()} ${props.minWClass || ''} ${isFullscreenLike() ? 'flex flex-col' : ''} ${chromeRounding()} border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg pointer-events-auto`}
              style={computedStyle()}
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
                      <Show when={showClose && !isFullscreenLike()}>
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

              <div class={bodyClass()}>
                {typeof props.children === "function"
                  ? props.children({ close: props.onClose })
                  : props.children}
              </div>

              <Show when={props.footer}>
                <div class="px-4 py-1 border-t border-[hsl(var(--border))]">
                  {props.footer}
                </div>
              </Show>

              <Show when={renderBottomClose()}>
                <div class="px-4 py-4 border-t border-[hsl(var(--border))] flex justify-end">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center px-4 py-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm font-medium hover:bg-[hsl(var(--accent))]"
                    onClick={props.onClose}
                  >
                    {t("common.close")}
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
