// src/ai/registry.js
import { fetchWithTimeout } from "../utils/net.js";

export const AI_PROVIDERS = [
  // OpenAI & compatibles
  { id: "openai",             labelKey: "settings.ai.providers.openai",           kind: "openai",        defaultBaseUrl: "https://api.openai.com/v1",        defaultModel: "gpt-4o-mini",                      modelHint: "gpt-4o, gpt-4.1, o4-mini" },
  { id: "openai-compatible",  labelKey: "settings.ai.providers.openaiCompatible", kind: "openai",        defaultBaseUrl: "https://api.example.com/v1",       defaultModel: "gpt-4o-mini",                      modelHint: "OpenAI-compatible path, e.g. /v1" },
  { id: "groq",               labelKey: "settings.ai.providers.groq",             kind: "openai",        defaultBaseUrl: "https://api.groq.com/openai/v1",   defaultModel: "llama-3.1-70b-versatile",           modelHint: "llama-3.1-70b-versatile" },
  { id: "together",           labelKey: "settings.ai.providers.together",         kind: "openai",        defaultBaseUrl: "https://api.together.xyz/v1",      defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", modelHint: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo" },
  { id: "mistral",            labelKey: "settings.ai.providers.mistral",          kind: "openai",        defaultBaseUrl: "https://api.mistral.ai/v1",        defaultModel: "open-mixtral-8x7b",                modelHint: "open-mixtral-8x7b" },

  // Anthropic
  { id: "anthropic",          labelKey: "settings.ai.providers.anthropic",        kind: "anthropic",     defaultBaseUrl: "https://api.anthropic.com/v1",     defaultModel: "claude-3-5-sonnet-20240620",         modelHint: "claude-3-5-sonnet-20240620", anthropicVersion: "2023-06-01" },

  // Google Gemini
  { id: "gemini",             labelKey: "settings.ai.providers.gemini",           kind: "gemini",        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1", defaultModel: "gemini-1.5-pro", modelHint: "gemini-1.5-pro" },

  // Azure OpenAI
  { id: "azure-openai",       labelKey: "settings.ai.providers.azure",            kind: "azure_openai",  defaultBaseUrl: "",                                 defaultModel: "", apiVersion: "2024-02-15-preview", modelHint: "gpt-4o (deployed name)" },
];

export function findProvider(id) {
  return AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
}

function trimSlash(s = "") { return String(s || "").replace(/\/+$/, ""); }

/** Cheap, provider-specific connectivity probe used by the Settings "Test" button. */
export async function testConnection(cfg) {
  const p = findProvider(cfg.providerId);
  const baseUrl = trimSlash(cfg.baseUrl || p.defaultBaseUrl || "");
  const apiKey = cfg.apiKey || "";

  try {
    let url = "";
    let init = { method: "GET", headers: {} };

    if (p.kind === "openai") {
      url = `${baseUrl}/models`;
      init.headers = { Authorization: `Bearer ${apiKey}` };
    } else if (p.kind === "anthropic") {
      url = `${baseUrl}/models`;
      init.headers = { "x-api-key": apiKey, "anthropic-version": p.anthropicVersion || "2023-06-01" };
    } else if (p.kind === "gemini") {
      // Gemini uses key in query param
      url = `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
    } else if (p.kind === "azure_openai") {
      // baseUrl like: https://<resource>.openai.azure.com/openai
      const apiVersion = (cfg.extra && cfg.extra.apiVersion) || "2024-02-15-preview";
      url = `${baseUrl}/models?api-version=${encodeURIComponent(apiVersion)}`;
      init.headers = { "api-key": apiKey };
    } else {
      return { ok: false, error: "Unknown provider kind." };
    }

    const res = await fetchWithTimeout(url, init);
    const status = res.status;
    let body = null;
    try { body = await res.json(); } catch { body = await res.text(); }
    return { ok: res.ok, status, body };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Fetch available models from the provider API */
export async function fetchModels(cfg) {
  const p = findProvider(cfg.providerId);
  const baseUrl = trimSlash(cfg.baseUrl || p.defaultBaseUrl || "");
  const apiKey = cfg.apiKey || "";

  if (!apiKey) return { ok: false, models: [], error: "No API key" };

  try {
    let url = "";
    let init = { method: "GET", headers: {} };

    if (p.kind === "openai") {
      url = `${baseUrl}/models`;
      init.headers = { Authorization: `Bearer ${apiKey}` };
    } else if (p.kind === "gemini") {
      url = `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
    } else {
      // Other providers don't have a simple models endpoint or require different handling
      return { ok: false, models: [], error: "Model listing not supported for this provider" };
    }

    const res = await fetchWithTimeout(url, init);
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody?.error?.message) errorMsg = errBody.error.message;
        else if (errBody?.error?.type) errorMsg = `${res.status}: ${errBody.error.type}`;
      } catch { /* ignore parse errors */ }
      return { ok: false, models: [], error: errorMsg };
    }

    const body = await res.json();
    let models = [];

    if (p.kind === "openai") {
      // OpenAI returns { data: [{ id: "model-name", ... }, ...] }
      models = (body.data || [])
        .map((m) => m.id)
        .filter((id) => id && !id.includes("embedding") && !id.includes("whisper") && !id.includes("tts") && !id.includes("dall-e"))
        .sort();
    } else if (p.kind === "gemini") {
      // Gemini returns { models: [{ name: "models/gemini-1.5-pro", ... }, ...] }
      models = (body.models || [])
        .map((m) => m.name?.replace(/^models\//, "") || "")
        .filter((name) => name && name.includes("gemini"))
        .sort();
    }

    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: err?.message || String(err) };
  }
}
