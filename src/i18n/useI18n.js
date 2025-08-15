// src/i18n/useI18n.js
import { createSignal } from "solid-js";
import en from "./en";
import ru from "./ru";

const DICTS = { en, ru };
const DEFAULT_LANG = "en";
const LANG_KEY = "lang";
const SHOW_KEYS_KEY = "i18n_show_keys";

let i18nSingleton;

function resolveKey(lang, key) {
  const dict = DICTS[lang] || {};
  if (dict[key] != null) return dict[key];
  if (DICTS[DEFAULT_LANG] && DICTS[DEFAULT_LANG][key] != null) return DICTS[DEFAULT_LANG][key];
  return `[${key}]`;
}

export const LANG_INFO = {
  en: { code: "EN", name: "English" },
  ru: { code: "RU", name: "Русский" }
};


export function useI18n() {
  if (!i18nSingleton) {
    const initialLang = (() => {
      try {
        const saved = localStorage.getItem(LANG_KEY);
        return saved && DICTS[saved] ? saved : DEFAULT_LANG;
      } catch { return DEFAULT_LANG; }
    })();

    const initialShowKeys = (() => {
      try {
        return localStorage.getItem(SHOW_KEYS_KEY) === "1";
      } catch { return false; }
    })();

    const [lang, setLangSignal] = createSignal(initialLang);
    const [showKeys, setShowKeysSignal] = createSignal(initialShowKeys);

    const setLang = (next) => {
      const value = DICTS[next] ? next : DEFAULT_LANG;
      setLangSignal(value);
      try { localStorage.setItem(LANG_KEY, value); } catch {}
    };

    const setShowKeys = (on) => {
      setShowKeysSignal(!!on);
      try { localStorage.setItem(SHOW_KEYS_KEY, on ? "1" : "0"); } catch {}
    };

    const t = (key) => {
      const base = resolveKey(lang(), key);
      return showKeys() ? `${base} [${key}]` : base;
    };

    i18nSingleton = {
      t,
      lang,
      setLang,
      showKeys,
      setShowKeys,
      available: Object.keys(DICTS),
    };
  }
  return i18nSingleton;
}
