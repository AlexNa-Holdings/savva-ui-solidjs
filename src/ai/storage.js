// src/ai/storage.js
const KEY = "savva.ai.config";

export function loadAiConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // ensure new fields exist
      if (typeof parsed.auto !== "boolean") parsed.auto = false;
      if (typeof parsed.useAi !== "boolean") parsed.useAi = true;
      return parsed;
    }
  } catch {}
  return {
    providerId: "openai",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    extra: {},
    auto: false,
    useAi: true,
  };
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
