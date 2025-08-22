// src/i18n/useI18n.js
import { createSignal } from "solid-js";
import en from "./en";
import ru from "./ru";

const DICTS = { en, ru };
const DEFAULT_LANG = "en";
const LANG_KEY = "lang";
const SHOW_KEYS_KEY = "i18n_show_keys";

let i18nSingleton;

// --- Start of New Logic ---
// This signal will hold the dictionaries loaded from the domain's config.yaml
const [domainDicts, setDomainDicts] = createSignal({});

function resolveKey(lang, key) {
  const dDicts = domainDicts();
  
  // Priority 1: Check the domain-specific dictionary for the current language.
  const domainVal = dDicts[lang]?.[key];
  if (domainVal != null) return domainVal;

  // Priority 2: Fall back to the app's built-in dictionary for the current language.
  const appVal = DICTS[lang]?.[key];
  if (appVal != null) return appVal;
  
  // Priority 3: Fall back to the app's built-in English dictionary.
  if (DICTS[DEFAULT_LANG]?.[key] != null) return DICTS[DEFAULT_LANG][key];

  return `[${key}]`;
}
// --- End of New Logic ---

export const LANG_INFO = {
  en: { code: "EN", name: "English" },
  ru: { code: "RU", name: "Русский" }
};

export function useI18n() {
  if (!i18nSingleton) {
    const initialLang = (() => { /* ... unchanged ... */ })();
    const initialShowKeys = (() => { /* ... unchanged ... */ })();

    const [lang, setLangSignal] = createSignal(initialLang);
    const [showKeys, setShowKeysSignal] = createSignal(initialShowKeys);

    const setLang = (next) => { /* ... unchanged ... */ };
    const setShowKeys = (on) => { /* ... unchanged ... */ };

    const t = (key) => {
      const base = resolveKey(lang(), key);
      return showKeys() ? `${base} [${key}]` : base;
    };

    // --- Start of New Logic ---
    // This new function will be called by AppContext to update the domain dictionaries.
    const setDomainDictionaries = (newDicts) => {
      setDomainDicts(newDicts || {});
    };
    // --- End of New Logic ---

    i18nSingleton = {
      t,
      lang,
      setLang,
      showKeys,
      setShowKeys,
      available: Object.keys(DICTS),
      setDomainDictionaries, // Expose the new setter function
    };
  }
  return i18nSingleton;
}