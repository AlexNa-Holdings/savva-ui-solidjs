// src/ai/storage.js
const KEY = "savva.ai.config";

const env = typeof import.meta !== "undefined" ? import.meta.env || {} : {};
const envKey = String(env.VITE_OPENAI_API_KEY || env.OPENAI_API_KEY || "").trim();
const envBase = String(env.VITE_OPENAI_API_BASE || env.OPENAI_API_BASE || "").trim();
const envModel = String(env.VITE_OPENAI_MODEL || env.OPENAI_MODEL || "").trim();

export function loadAiConfig() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      parsed = JSON.parse(raw);
    }
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    parsed = {
      providerId: "openai",
      apiKey: envKey || "",
      baseUrl: envBase || "https://api.openai.com/v1",
      model: envModel || "",
      extra: {},
      auto: false,
      useAi: true,
    };
  } else {
    if (typeof parsed.providerId !== "string" || !parsed.providerId) parsed.providerId = "openai";
    if (!parsed.baseUrl) parsed.baseUrl = envBase || "https://api.openai.com/v1";
    if (!parsed.model && envModel) parsed.model = envModel;
    if (typeof parsed.apiKey === "string") {
      const trimmed = parsed.apiKey.trim();
      // Guard against accidental JSON/error objects being saved in place of the key
      if (trimmed.startsWith("{") && trimmed.includes('"context":"ai-test"')) {
        parsed.apiKey = "";
      } else {
        parsed.apiKey = trimmed;
      }
    }
    if ((!parsed.apiKey || String(parsed.apiKey).trim() === "") && envKey) {
      parsed.apiKey = envKey;
    }
    if (typeof parsed.extra !== "object" || parsed.extra === null) parsed.extra = {};
    if (typeof parsed.auto !== "boolean") parsed.auto = false;
    if (typeof parsed.useAi !== "boolean") parsed.useAi = true;
    if (typeof parsed.extra.temperature === "string") {
      parsed.extra.temperature = parsed.extra.temperature.trim();
      if (parsed.extra.temperature === "") delete parsed.extra.temperature;
    } else if (typeof parsed.extra.temperature === "number") {
      if (Number.isFinite(parsed.extra.temperature)) {
        parsed.extra.temperature = String(parsed.extra.temperature);
      } else {
        delete parsed.extra.temperature;
      }
    }
  }

  if (typeof parsed.apiKey === "string") parsed.apiKey = parsed.apiKey.trim();
  if (typeof parsed.baseUrl === "string") parsed.baseUrl = parsed.baseUrl.trim();
  if (typeof parsed.model === "string") parsed.model = parsed.model.trim();

  return parsed;
}

export function saveAiConfig(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg || {})); } catch {}
  try {
    window.dispatchEvent(new CustomEvent("savva:ai-config-changed", { detail: cfg }));
  } catch {}
}

export function onAiConfigChanged(handler) {
  const h = (e) => handler?.(e.detail);
  window.addEventListener("savva:ai-config-changed", h);
  return () => window.removeEventListener("savva:ai-config-changed", h);
}

export function getAiConfig() {
  return loadAiConfig();
}
