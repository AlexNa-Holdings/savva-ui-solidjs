// src/components/ui/Tabs.jsx
/* src/components/ui/Tabs.jsx */
import { For, createSignal, onMount, onCleanup, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function Tabs(props) {
  // props.items: [{ id, label, icon?, disabled? }]
  // props.value: selected id
  // props.onChange(nextId)
  // props.class?: wrapper classnames

  const app = useApp();
  const { t } = app;

  const items = () => props.items || [];
  const value = () => props.value;

  // --- responsive compact handling ---
  let listEl;
  const [compact, setCompact] = createSignal(false);

  function hasWrapped() {
    if (!listEl) return false;
    const lis = listEl.querySelectorAll(":scope > li");
    if (!lis.length) return false;
    const firstTop = lis[0].offsetTop;
    for (let i = 1; i < lis.length; i++) {
      if (lis[i].offsetTop > firstTop) return true; // a second row appeared
    }
    return false;
  }

  let rafId;
  function measure() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (!listEl) return;

      // Test full mode first
      listEl.dataset.compact = "0";
      setCompact(false);

      if (hasWrapped()) {
        // Switch to compact (icons only)
        listEl.dataset.compact = "1";
        setCompact(true);

        // If it *still* wraps when compact, mark (optional)
        listEl.dataset.overflow = hasWrapped() ? "1" : "0";
      } else {
        listEl.dataset.overflow = "0";
      }
    });
  }

  onMount(() => {
    measure();

    // Re‑measure on size changes of the list itself
    const ro = new ResizeObserver(measure);
    if (listEl) ro.observe(listEl);

    // And on viewport changes
    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    onCleanup(() => {
      ro.disconnect?.();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
    });
  });

  // Re‑measure when the tabs list changes
  createEffect(() => {
    items(); // track items
    measure();
  });

  return (
    <ul
      ref={(el) => (listEl = el)}
      class={`tabs ${props.class || ""}`}
      role="tablist"
      aria-label={t("tabs.aria")}
      data-compact={compact() ? "1" : "0"}
    >
      <For each={items()}>
        {(it) => {
          const active = () => it.id === value();
          const disabled = !!it.disabled;
          const tabId = `tab-${it.id}`;

          const onClick = (e) => {
            e.preventDefault();
            if (disabled || active()) return;
            props.onChange?.(it.id);
          };

          const onKeyDown = (e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!active()) props.onChange?.(it.id);
            }
          };

          return (
            <li
              classList={{ active: active() }}
              role="presentation"
              aria-selected={active()}
            >
              <a
                id={tabId}
                href="#"
                role="tab"
                aria-selected={active() ? "true" : "false"}
                aria-disabled={disabled ? "true" : "false"}
                // Keep accessible name even when the label is visually hidden
                aria-label={it.label}
                title={compact() ? it.label : undefined}
                tabIndex={disabled ? -1 : 0}
                onClick={onClick}
                onKeyDown={onKeyDown}
              >
                {/* icon then text label */}
                {it.icon ? (
                  <span class="tab__icon" aria-hidden="true">{it.icon}</span>
                ) : null}
                <span class="tab__label">{it.label}</span>
              </a>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
