// src/components/ui/Tabs.jsx
/* src/components/ui/Tabs.jsx */
import { For, createMemo, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function Tabs(props) {
  const app = useApp();
  const { t } = app;

  const isControlled = () => props.value != null;
  const [internal, setInternal] = createSignal(props.defaultValue ?? props.items?.[0]?.id ?? "");
  const current = createMemo(() => (isControlled() ? props.value : internal()));

  const setValue = (id) => {
    if (!isControlled()) setInternal(id);
    props.onChange?.(id);
  };

  // simple keyboard nav
  const onKey = (e, idx) => {
    const items = props.items || [];
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const it = items[next];
    if (!it || it.disabled) return;
    setValue(it.id);
    document.getElementById(`tab-${it.id}`)?.focus();
  };

  // edge mask for overflow (optional)
  let scroller;
  const update = () => {
    if (!scroller) return;
    scroller.dataset.atStart = scroller.scrollLeft <= 0 ? "1" : "0";
    scroller.dataset.atEnd =
      Math.ceil(scroller.scrollLeft + scroller.clientWidth) >= scroller.scrollWidth ? "1" : "0";
  };
  onMount(() => {
    update();
    scroller?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
  });
  onCleanup(() => {
    scroller?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  });

  return (
    <div class={`rotabs ${props.class || ""}`}>
      <div class="rotabs__bar">
        <div ref={scroller} role="tablist" aria-label={t("tabs.aria")} class="rotabs__list">
          <For each={props.items || []}>
            {(it, i) => {
              const active = createMemo(() => current() === it.id);
              return (
                <button
                  id={`tab-${it.id}`}
                  data-tab={it.id}
                  role="tab"
                  aria-selected={active()}
                  aria-controls={`panel-${it.id}`}
                  aria-disabled={!!it.disabled}
                  tabindex={active() ? "0" : "-1"}
                  class="rotabs__tab"
                  data-active={active() ? "true" : "false"}
                  onClick={() => !it.disabled && setValue(it.id)}
                  onKeyDown={(e) => onKey(e, i())}
                  title={typeof it.label === "string" ? it.label : undefined}
                >
                  {it.icon ? <span class="rotabs__chip">{it.icon}</span> : null}
                  <span class="truncate">{it.label}</span>
                </button>
              );
            }}
          </For>
        </div>
      </div>
      {/* Panels: pass children or render outside; TabsBar renders its own panels. */}
    </div>
  );
}
