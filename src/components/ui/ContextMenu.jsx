// src/components/ui/ContextMenu.jsx
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { ChevronDownIcon } from "./icons/ActionIcons.jsx";

export default function ContextMenu(props) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [menuClass, setMenuClass] = createSignal("bottom-full right-0 mb-2");
  const [menuWidth, setMenuWidth] = createSignal(undefined);

  let containerRef;
  let menuRef;     // actual visible menu
  let sizerRef;    // hidden sizer for measuring

  const handleClickOutside = (event) => {
    if (containerRef && !containerRef.contains(event.target)) setIsOpen(false);
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  const handleItemClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    item.onClick?.();
    setIsOpen(false);
  };

  const positionClass = props.positionClass || "absolute -bottom-2 -right-2 z-20";
  const ButtonIcon = () => <ChevronDownIcon class="w-4 h-4" />;

  function computeWidth() {
    // If consumer explicitly sets width, respect it
    if (props.fixedWidthPx && Number.isFinite(props.fixedWidthPx)) {
      setMenuWidth(Math.max(0, Number(props.fixedWidthPx)));
      return;
    }

    const items = Array.isArray(props.items) ? props.items : [];
    if (!items.length || !sizerRef) {
      setMenuWidth(undefined);
      return;
    }

    // Measure the longest label width with same text styles and padding
    const PADDING_X = 32; // px-4 on both sides (Tailwind px-4 = 1rem ≈ 16px * 2)
    const MIN_GAP = 4;    // small safety gap

    let maxText = 0;
    // use the same text class as menu items to match font metrics
    const measurer = sizerRef;
    measurer.style.whiteSpace = "nowrap";
    items.forEach((it) => {
      measurer.textContent = String(it?.label ?? "");
      const w = Math.ceil(measurer.scrollWidth);
      if (w > maxText) maxText = w;
    });

    // Also ensure we’re at least as wide as the trigger (so it doesn’t look cramped)
    const triggerW = containerRef?.getBoundingClientRect?.().width || 0;
    // Cap to viewport minus small margin
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const cap = Math.max(240, vw - 24); // never exceed (viewport - 24px)

    const calculated = Math.min(Math.max(maxText + PADDING_X + MIN_GAP, triggerW), cap);
    setMenuWidth(calculated);
  }

  function toggleMenu() {
    const next = !isOpen();
    if (next && containerRef) {
      // pick top/bottom placement
      const btnRect = containerRef.getBoundingClientRect();
      const estimatedMenuHeight = 160;
      setMenuClass(btnRect.top < estimatedMenuHeight ? "top-full right-0 mt-2" : "bottom-full right-0 mb-2");
      // compute width right before opening
      computeWidth();
      // and after first paint, in case fonts/layout shift
      queueMicrotask(() => computeWidth());
      // keep width correct on resize while open
      window.addEventListener("resize", computeWidth, { passive: true });
    } else {
      window.removeEventListener("resize", computeWidth);
    }
    setIsOpen(next);
  }

  onCleanup(() => window.removeEventListener("resize", computeWidth));

  const triggerClass =
    props.buttonClass ||
    "p-1 rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]";

  return (
    <div class={positionClass} ref={el => (containerRef = el)}>
      <button
        class={triggerClass}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMenu(); }}
        aria-haspopup="true"
        aria-expanded={isOpen()}
      >
        {props.triggerContent ? props.triggerContent : <ButtonIcon />}
      </button>

      {/* Invisible sizer used for width measurement */}
      <div
        ref={el => (sizerRef = el)}
        aria-hidden="true"
        class="pointer-events-none fixed -top-[9999px] -left-[9999px] text-sm"
        style={{
          "line-height": "1.375", // approx leading-snug
          // mirror item text styles as much as possible
          "font": "inherit",
          "letter-spacing": "inherit",
        }}
      />

      <Show when={isOpen()}>
        <div
          ref={el => (menuRef = el)}
          class={`absolute ${menuClass()} rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black/10`}
          style={menuWidth() ? { width: `${menuWidth()}px` } : undefined}
          role="menu"
        >
          <ul class="py-1">
            <For each={props.items}>
              {(item) => (
                <li>
                  <a
                    href="#"
                    class="block w-full text-left px-4 py-2 text-sm leading-snug hover:bg-[hsl(var(--accent))] whitespace-nowrap"
                    onClick={(e) => handleItemClick(e, item)}
                    role="menuitem"
                  >
                    {item.label}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
