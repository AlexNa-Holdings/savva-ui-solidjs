// src/x/ui/Tabs.jsx
import { For, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function Tabs(props) {
  const app = useApp();
  const { t } = app;

  const items = () => props.items || [];
  const value = () => props.value;
  const [compact, setCompact] = createSignal(false);

  onMount(() => {
    // Parse the prop more robustly.
    const compactWidth = parseInt(props.compactWidth, 10);

    // Check if we received a valid number and enable the feature.
    if (!isNaN(compactWidth) && compactWidth > 0) {
      console.log(`[Tabs] Responsive mode enabled with width: ${compactWidth}`);

      const checkWidth = () => {
        setCompact(window.innerWidth <= compactWidth);
      };

      checkWidth(); // Run on initial mount
      window.addEventListener("resize", checkWidth, { passive: true });
      onCleanup(() => window.removeEventListener("resize", checkWidth));
    } else {
      console.log("[Tabs] Responsive mode disabled (compactWidth prop not provided or invalid).");
    }
  });

  return (
    <ul
      class={`tabs ${props.class || ""}`}
      role="tablist"
      aria-label={t("tabs.aria")}
      data-compact={compact() ? "true" : "false"}
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
            <li classList={{ active: active() }} role="presentation" aria-selected={active()}>
              <a
                id={tabId}
                href="#"
                role="tab"
                aria-selected={active() ? "true" : "false"}
                aria-disabled={disabled ? "true" : "false"}
                aria-label={it.label}
                title={it.label}
                tabIndex={disabled ? -1 : 0}
                onClick={onClick}
                onKeyDown={onKeyDown}
              >
                {it.icon ? <span class="tab__icon" aria-hidden="true">{it.icon}</span> : null}
                <span class="tab__label">{it.label}</span>
              </a>
            </li>
          );
        }}
      </For>
    </ul>
  );
}