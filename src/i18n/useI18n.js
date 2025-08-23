// src/i18n/useI18n.js
import { createSignal } from "solid-js";
import en from "./en";
import ru from "./ru";

const DICTS = { en, ru };
const DEFAULT_LANG = "en";
const LANG_KEY = "lang";
const SHOW_KEYS_KEY = "i18n_show_keys";

let i18nSingleton;

// Domain dictionaries loaded from assets/config.yaml
const [domainDicts, setDomainDicts] = createSignal({});

function normalizeLang(code) {
  const s = String(code || "").trim().toLowerCase();
  const [base] = s.split(/[-_]/); // "en-US" -> "en"
  return base || DEFAULT_LANG;
}

// Keep domain → app → EN fallback order
function resolveKey(lang, key) {
  const d = domainDicts();
  const fromDomain = d[lang]?.[key];
  if (fromDomain != null) return fromDomain;

  const fromApp = DICTS[lang]?.[key];
  if (fromApp != null) return fromApp;

  if (DICTS[DEFAULT_LANG]?.[key] != null) return DICTS[DEFAULT_LANG][key];
  return `[${key}]`;
}

// Used by the Lang selector for labels
export const LANG_INFO = {
  en: { code: "EN", name: "English" },
  ru: { code: "RU", name: "Русский" },
  fr: { code: "FR", name: "Français" },
  ua: { code: "UA", name: "Українська" },
};

export function useI18n() {
  if (!i18nSingleton) {
    const readInitialLang = () => {
      try {
        const v = localStorage.getItem(LANG_KEY);
        return normalizeLang(v || DEFAULT_LANG);
      } catch {
        return DEFAULT_LANG;
      }
    };
    const readInitialShowKeys = () => {
      try {
        return localStorage.getItem(SHOW_KEYS_KEY) === "1";
      } catch {
        return false;
      }
    };

    const [lang, setLangSignal] = createSignal(readInitialLang());
    const [showKeys, setShowKeysSignal] = createSignal(readInitialShowKeys());

    function setLang(next) {
      const v = normalizeLang(next);
      setLangSignal(v); // <-- commit to signal (reactivity)
      try { localStorage.setItem(LANG_KEY, v); } catch {}
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("lang", v);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("savva:lang", { detail: { lang: v } }));
      }
    }

    function setShowKeys(on) {
      const v = !!on;
      setShowKeysSignal(v);
      try { localStorage.setItem(SHOW_KEYS_KEY, v ? "1" : "0"); } catch {}
    }

    const t = (key) => {
      const base = resolveKey(lang(), key);
      return showKeys() ? `${base} [${key}]` : base;
    };

    // Cross‑tab sync
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === LANG_KEY && e.newValue) setLangSignal(normalizeLang(e.newValue));
        if (e.key === SHOW_KEYS_KEY) setShowKeysSignal(e.newValue === "1");
      });
    }

    // Expose union of built‑ins + domain dicts (useful for tooling/UI)
    const available = () => {
      const builtin = Object.keys(DICTS);
      const domain = Object.keys(domainDicts());
      return Array.from(new Set([...builtin, ...domain]));
    };

    i18nSingleton = {
      t,
      lang,
      setLang,
      showKeys,
      setShowKeys,
      available,                 // dynamic list now
      setDomainDictionaries: (d) => setDomainDicts(d || {}),
    };
  }
  return i18nSingleton;
}
