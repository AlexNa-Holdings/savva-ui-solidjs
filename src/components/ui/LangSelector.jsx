// src/components/ui/LangPillSelector.jsx
import { createMemo, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { LANG_INFO } from "../../i18n/useI18n";

export default function LangPillSelector(props) {
  const app = useApp();

  // options: explicit list → domain config locales → i18n available
  const codes = createMemo(() => {
    if (Array.isArray(props.options) && props.options.length) return props.options;
    const fromDomain = (app.domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    if (fromDomain.length) return fromDomain;
    return app.i18nAvailable || [];
  });

  const value = () => (props.value || app.lang?.() || "").toLowerCase();
  const onChange = (code) => (props.onChange ? props.onChange(code) : app.setLang?.(code));

  return (
    <div class={`themed-segment ${props.class || ""}`} role="radiogroup" aria-label={app.t("rightPane.language")}>
      <For each={codes()}>
        {(code) => {
          const c = String(code).toLowerCase();
          const info = LANG_INFO[c] || { code: c.toUpperCase(), name: c.toUpperCase() };
          const active = () => value() === c;
          return (
            <button
              type="button"
              class={`themed-pill ${active() ? "is-active" : ""}`}
              role="radio"
              aria-checked={active()}
              onClick={() => onChange(c)}
              title={info.name}
            >
              {info.code}
            </button>
          );
        }}
      </For>
    </div>
  );
}
