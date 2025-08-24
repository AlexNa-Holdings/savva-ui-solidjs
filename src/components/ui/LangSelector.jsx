// src/components/ui/LangSelector.jsx
import { For, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { LANG_INFO } from "../../i18n/useI18n";

export default function LangSelector(props) {
  const app = useApp();
  const codes = createMemo(() => props.codes || []);
  const value = () => (props.value || app.lang?.() || "").toLowerCase();
  const onChange = (code) => (props.onChange ? props.onChange(code) : app.setLang?.(code));
  
  const isStretch = () => props.variant === 'stretch';

  return (
    <Show when={codes().length > 1}>
      <div 
        classList={{
          'themed-segment': !isStretch(),
          // --- MODIFICATION: Use CSS Grid for the stretch variant ---
          'grid w-full grid-cols-4 gap-1 p-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]': isStretch(),
        }}
        class={props.class || ""} 
        role="group" // Changed from radiogroup for better semantics with multiple rows
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
                // No flex-1 needed for grid layout
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