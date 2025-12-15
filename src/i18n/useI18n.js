// src/i18n/useI18n.js
import { createSignal } from "solid-js";
import en from "./en";
import ru from "./ru";
import sr from "./sr";
import ua from "./ua";
import fr from "./fr";
import es from "./es";
import { dbg } from "../utils/debug";

export const LANG_INFO = {
  en: { code: "EN", name: "English" },
  ru: { code: "RU", name: "Русский" },
  fr: { code: "FR", name: "Français" },
  ua: { code: "UA", name: "Українська" },
  sr: { code: "SR", name: "Српски" },
  es: { code: "ES", name: "Español" },
};

const APP_DICTS = { en, ru, fr, ua, sr, es };
const DEFAULT_LANG = "en";
const LANG_KEY = "lang";
const SHOW_KEYS_KEY = "i18n_show_keys";
let i18nSingleton;

function normalizeLang(code) {
  const s = String(code || "").trim().toLowerCase();
  const [base] = s.split(/[-_]/);
  return base || DEFAULT_LANG;
}

export function useI18n() {
  if (!i18nSingleton) {
    const [domainDicts, setDomainDicts] = createSignal({});
    const [domainLangCodes, setDomainLangCodes] = createSignal([]);

    const resolveKey = (lang, key) => {
      const d = domainDicts();
      const fromDomain = d[lang]?.[key];
      if (fromDomain != null) return fromDomain;
      const fromApp = APP_DICTS[lang]?.[key];
      if (fromApp != null) return fromApp;
      if (APP_DICTS[DEFAULT_LANG]?.[key] != null) return APP_DICTS[DEFAULT_LANG][key];
      return `[${key}]`;
    }

    const readInitialLang = () => { try { const v = localStorage.getItem(LANG_KEY); return normalizeLang(v || DEFAULT_LANG); } catch { return DEFAULT_LANG; } };
    const readInitialShowKeys = () => { try { return localStorage.getItem(SHOW_KEYS_KEY) === "1"; } catch { return false; } };

    const [lang, setLangSignal] = createSignal(readInitialLang());
    const [showKeys, setShowKeysSignal] = createSignal(readInitialShowKeys());

    function setLang(next) {
      const v = normalizeLang(next);
      const current = lang();

      if (current === v) {
        return;
      }
      setLangSignal(v);
      try { localStorage.setItem(LANG_KEY, v); } catch { }
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
      try { localStorage.setItem(SHOW_KEYS_KEY, v ? "1" : "0"); } catch { }
    }

    const t = (key, params) => {
      let base = resolveKey(lang(), key);
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          base = base.replace(`{${paramKey}}`, String(paramValue));
        }
      }
      return showKeys() ? `${base} [${key}]` : base;
    };

    /** Get translation for a specific language (not the current UI language) */
    const tLang = (targetLang, key, params) => {
      const normalizedLang = normalizeLang(targetLang);
      let base = resolveKey(normalizedLang, key);
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          base = base.replace(`{${paramKey}}`, String(paramValue));
        }
      }
      return showKeys() ? `${base} [${key}]` : base;
    };

    // The problematic event listener has been removed.

    const available = () => {
      const domainCodes = domainLangCodes();
      if (domainCodes.length > 0) return domainCodes;
      return Object.keys(APP_DICTS);
    };

    i18nSingleton = {
      t, tLang, lang, setLang, showKeys, setShowKeys, available,
      setDomainDictionaries: (d) => setDomainDicts(d || {}),
      setDomainLangCodes: (codes) => setDomainLangCodes(codes || []),
    };
  }
  return i18nSingleton;
}