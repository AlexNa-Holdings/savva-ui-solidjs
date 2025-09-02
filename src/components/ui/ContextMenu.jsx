// src/components/ui/ContextMenu.jsx
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ChevronDownIcon } from "./icons/ActionIcons.jsx";

export default function ContextMenu(props) {
  const { t } = useApp();

  const [isOpen, setIsOpen] = createSignal(false);
  const [menuClass, setMenuClass] = createSignal("top-full right-0 mt-1");
  const [menuWidth, setMenuWidth] = createSignal(undefined);

  let rootRef;     // wrapper around the button (positioning context)
  let menuRef;     // visible menu element
  let sizerRef;    // hidden measurer

  // ——— helpers ————————————————————————————————————————————————————————————
  const outside = (e) => { if (rootRef && !rootRef.contains(e.target)) setIsOpen(false); };

  function computeWidth() {
    if (props.fixedWidthPx && Number.isFinite(props.fixedWidthPx)) {
      setMenuWidth(Math.max(0, Number(props.fixedWidthPx)));
      return;
    }
    const items = Array.isArray(props.items) ? props.items : [];
    if (!items.length || !sizerRef) { setMenuWidth(undefined); return; }

    const PADDING_X = 32;
    const MIN_GAP = 4;

    let maxText = 0;
    const measurer = sizerRef;
    measurer.style.whiteSpace = "nowrap";
    items.forEach((it) => {
      measurer.textContent = String(it?.label ?? "");
      maxText = Math.max(maxText, Math.ceil(measurer.scrollWidth));
    });

    const triggerW = rootRef?.getBoundingClientRect?.().width || 0;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const cap = Math.max(240, vw - 24);

    setMenuWidth(Math.min(Math.max(maxText + PADDING_X + MIN_GAP, triggerW), cap));
  }

  function decidePlacement() {
    if (!rootRef) return;
    const btnRect = rootRef.getBoundingClientRect();
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    // conservative height guess; real height comes slightly larger with many items
    const estimatedMenuHeight = 180;
    const spaceBelow = vh - btnRect.bottom;
    const shouldFlipUp = spaceBelow < estimatedMenuHeight;

    // Default BELOW; flip ABOVE only if needed.
    setMenuClass(shouldFlipUp ? "bottom-full right-0 mb-1" : "top-full right-0 mt-1");
  }

  function toggle() {
    const next = !isOpen();
    if (next) {
      decidePlacement();
      computeWidth();
      queueMicrotask(computeWidth);
      window.addEventListener("resize", computeWidth, { passive: true });
      window.addEventListener("resize", decidePlacement, { passive: true });
      document.addEventListener("mousedown", outside);
    } else {
      window.removeEventListener("resize", computeWidth);
      window.removeEventListener("resize", decidePlacement);
      document.removeEventListener("mousedown", outside);
    }
    setIsOpen(next);
  }

  onCleanup(() => {
    window.removeEventListener("resize", computeWidth);
    window.removeEventListener("resize", decidePlacement);
    document.removeEventListener("mousedown", outside);
  });

  const triggerClass =
    props.buttonClass ||
    "p-1 rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] " +
    "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]";

  // ——— render ————————————————————————————————————————————————————————————
  return (
    <div
      ref={el => (rootRef = el)}
      class={props.class || ""}
      // RELATIVE + inline-block keeps the menu snug to the button with no weird gaps
      style="position: relative; display: inline-block;"
    >
      <button
        class={triggerClass}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        aria-haspopup="true"
        aria-expanded={isOpen() ? "true" : "false"}
        aria-label={props.ariaLabel || t("ui.openMenu")}
        title={props.title || ""}
        type="button"
      >
        {props.triggerContent ? props.triggerContent : <ChevronDownIcon class="w-4 h-4" />}
      </button>

      {/* Invisible sizer */}
      <div
        ref={el => (sizerRef = el)}
        aria-hidden="true"
        class="pointer-events-none fixed -top-[9999px] -left-[9999px] text-sm"
        style={{ "line-height": "1.375", font: "inherit", "letter-spacing": "inherit" }}
      />

      <Show when={isOpen()}>
        <div
          ref={el => (menuRef = el)}
          // z-50 ensures the menu is above cards/controls; border+bg remove see-through effect
          class={`absolute ${menuClass()} z-50 rounded-md border border-[hsl(var(--border))] ` +
                 `bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg`}
          style={menuWidth() ? { width: `${menuWidth()}px` } : undefined}
          role="menu"
        >
          <ul class="py-1">
            <For each={props.items}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    class="block w-full text-left px-4 py-2 text-sm leading-snug hover:bg-[hsl(var(--accent))]"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); item.onClick?.(); setIsOpen(false); }}
                    role="menuitem"
                    aria-label={String(item.label || "")}
                    title={String(item.label || "")}
                  >
                    {item.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
