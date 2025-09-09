// src/i18n/useI18n.js
import { createSignal } from "solid-js";
import en from "./en";
import ru from "./ru";
import sr from "./sr";
import ua from "./ua";
import fr from "./fr";
import { dbg } from "../utils/debug";

export const LANG_INFO = {
  en: { code: "EN", name: "English" },
  ru: { code: "RU", name: "Русский" },
  fr: { code: "FR", name: "Français" },
  ua: { code: "UA", name: "Українська" },
  sr: { code: "SR", name: "Српски" },
};

const APP_DICTS = { en, ru, fr, ua, sr };
const DEFAULT_LANG = "en";
const LANG_KEY = "lang";
const SHOW_KEYS_KEY = "i18n_show_keys";
let i18nSingleton;
let setLangCallCounter = 0;

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

    const [lang, _setLangSignal] = createSignal(readInitialLang());
    const [showKeys, setShowKeysSignal] = createSignal(readInitialShowKeys());
    
    // Create our own wrapped setter with a trace for debugging the reset issue
    const setLangSignal = (val) => {
        console.groupCollapsed(`[signal-trace] setLangSignal('${val}')`);
        console.trace("Stack trace:");
        console.groupEnd();
        _setLangSignal(val);
    }

    function setLang(next) {
      setLangCallCounter++;
      const callId = setLangCallCounter;
      const v = normalizeLang(next);
      const current = lang();

      dbg.log("useI18n", `[Call #${callId}] setLang called with '${next}'. Normalized: '${v}', Current: '${current}'.`);
      
      if (current === v) return;
      
      setLangSignal(v); // Use our wrapped setter
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

    const t = (key, params) => {
      let base = resolveKey(lang(), key);
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          base = base.replace(`{${paramKey}}`, String(paramValue));
        }
      }
      return showKeys() ? `${base} [${key}]` : base;
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (e.key === LANG_KEY && e.newValue) {
          dbg.log("useI18n:storageEvent", `Applying value from storage event: ${e.newValue}`);
          setLangSignal(normalizeLang(e.newValue)); // Use our wrapped setter
        }
        if (e.key === SHOW_KEYS_KEY) setShowKeysSignal(e.newValue === "1");
      });
    }

    const available = () => {
      const domainCodes = domainLangCodes();
      if (domainCodes.length > 0) return domainCodes;
      return Object.keys(APP_DICTS);
    };

    i18nSingleton = {
      t, lang, setLang, showKeys, setShowKeys, available,
      setDomainDictionaries: (d) => setDomainDicts(d || {}),
      setDomainLangCodes: (codes) => setDomainLangCodes(codes || []),
    };
  }
  return i18nSingleton;
}