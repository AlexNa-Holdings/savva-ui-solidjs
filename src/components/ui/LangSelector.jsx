// src/components/ui/LangSelector.jsx
import { For, Show, createMemo, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { LANG_INFO } from "../../i18n/useI18n";
import { dbg } from "../../utils/debug";

export default function LangSelector(props) {
  const app = useApp();
  const codes = createMemo(() => props.codes || []);
  const value = () => (props.value || app.lang?.() || "").toLowerCase();
  
  const onChange = (code) => {
    dbg.log("LangSelector", `User clicked '${code}'. Calling onChange.`);
    return (props.onChange ? props.onChange(code) : app.setLang?.(code));
  };
  
  createEffect(() => {
    dbg.log("LangSelector", `Active value updated to '${value()}'`);
  });
  
  const isStretch = () => props.variant === 'stretch';

  return (
    <Show when={codes().length > 1}>
      <div 
        classList={{
          'themed-segment': !isStretch(),
          'grid w-full grid-cols-4 gap-1 p-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]': isStretch(),
        }}
        class={props.class || ""} 
        role="group"
        aria-label={app.t("rightPane.language")}
      >
        <For each={codes()}>
          {(code) => {
            const c = String(code).toLowerCase();
            const info = LANG_INFO[c] || { code: c.toUpperCase(), name: c.toUpperCase() };
            const active = () => value() === c;
            return (
              <button
                type="button"
                class={`themed-pill ${active() ? "is-active" : ""}`}
                aria-pressed={active()}
                onClick={() => onChange(c)}
                title={info.name}
              >
                {info.code}
              </button>
            );
          }}
        </For>
      </div>
    </Show>
  );
}