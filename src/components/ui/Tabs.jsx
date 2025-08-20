// src/components/ui/Tabs.jsx
import { For, createSignal, onMount, onCleanup, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function Tabs(props) {
  const app = useApp();
  const { t } = app;

  const items = () => props.items || [];
  const value = () => props.value;

  // --- responsive compact handling ---
  let listEl;
  const [compact, setCompact] = createSignal(false);

  let rafId;
  function measure() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (!listEl) return;

      // To get an accurate measurement, we first temporarily force full-text mode.
      listEl.dataset.compact = "0";

      // NEW LOGIC: Check if the full width of the content is greater than the visible width.
      const isOverflowing = listEl.scrollWidth > listEl.clientWidth;

      // Now, set the final state. The JSX binding will apply the correct attribute.
      setCompact(isOverflowing);
    });
  }

  onMount(() => {
    // The ResizeObserver is sufficient and will handle all size changes.
    const ro = new ResizeObserver(measure);
    if (listEl) ro.observe(listEl);

    onCleanup(() => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    });
  });

  // Re-measure when the list of items changes.
  createEffect(() => {
    items(); // track items so the effect re-runs
    if (listEl) { // Check if element is mounted before measuring
      measure();
    }
  });

  return (
    <ul
      ref={listEl}
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
                aria-label={it.label}
                title={compact() ? it.label : undefined}
                tabIndex={disabled ? -1 : 0}
                onClick={onClick}
                onKeyDown={onKeyDown}
              >
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