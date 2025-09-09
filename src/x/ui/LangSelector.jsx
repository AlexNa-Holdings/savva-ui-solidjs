// src/x/ui/LangSelector.jsx
import { For, Show, createMemo, createEffect, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { LANG_INFO } from "../../i18n/useI18n.js";
import { dbg } from "../../utils/debug.js";

let _LS_COUNTER = 0;

export default function LangSelector(props) {
  const app = useApp();
  const id = ++_LS_COUNTER;

  const codes = createMemo(() => props.codes || []);
  const value = () => (
    dbg.log("LangSelector", `[#${id}] resolving active value`, { prop: props.value, appLang: app.lang?.() }),
    props.value || app.lang?.() || "").toLowerCase();

  onMount(() => {
    dbg.log("LangSelector", `[#${id}] mount`, { codes: codes(), value: value() });
  });
  onCleanup(() => {
    dbg.log("LangSelector", `[#${id}] unmount`);
  });

  let prevCodesJson = "";
  createEffect(() => {
    const cur = JSON.stringify(codes());
    if (cur !== prevCodesJson) {
      dbg.log("LangSelector", `[#${id}] codes changed`, { prev: prevCodesJson ? JSON.parse(prevCodesJson) : null, next: codes() });
      prevCodesJson = cur;
    }
  });

  createEffect(() => {
    dbg.log("LangSelector", `[#${id}] active value → '${value()}'`);
  });

  const onChange = (code) => {
    dbg.log("LangSelector", `[#${id}] user clicked '${code}' → onChange`);
    return (props.onChange ? props.onChange(code) : app.setLang?.(code));
  };

  const isStretch = () => props.variant === "stretch";

  return (
    <Show when={codes().length > 1}>
      <div
        classList={{
          "themed-segment": !isStretch(),
          "grid w-full grid-cols-4 gap-1 p-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]": isStretch(),
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
