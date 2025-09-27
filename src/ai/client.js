// src/ai/client.js
import { getAiConfig } from "./storage.js";
import { findProvider } from "./registry.js";
import { fetchWithTimeout } from "../utils/net.js";

const DEFAULT_AI_TIMEOUT_MS = 360000; // 360s default for LLM calls
const DEFAULT_AI_TEMPERATURE = 1; // Provider default unless overridden in settings

function trimSlash(s = "") {
  return String(s || "").replace(/\/+$/, "");
}
function parseJsonStrict(s) {
  const raw = String(s || "").trim();
  try { return JSON.parse(raw); } catch {}
  const fenced =
    raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const b = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (b >= 0 && e > b) {
    try { return JSON.parse(raw.slice(b, e + 1)); } catch {}
  }
  throw new Error("Bad JSON from AI");
}

// ---- Provider callers ----

function buildProviderError({ res, body, url }) {
  const message =
    body?.error?.message || body?.message || body?.error_description || res.statusText || "AI request failed";
  const err = new Error(message);
  err.status = res.status;
  err.code = body?.error?.code || body?.code;
  err.endpoint = url;
  err.requestId =
    body?.error?.request_id || body?.request_id || res.headers?.get?.("x-request-id") || undefined;
  err.body = body;
  return err;
}

async function callOpenAICompat({ baseUrl, apiKey, model, messages, timeoutMs, temperature }) {
  const url = `${trimSlash(baseUrl)}/chat/completions`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature }),
    timeoutMs,
  });
  const j = await res.json();
  if (!res.ok) throw buildProviderError({ res, body: j, url });
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callAzureOpenAI({ baseUrl, apiKey, model, apiVersion, messages, timeoutMs, temperature }) {
  const url = `${trimSlash(baseUrl)}/deployments/${encodeURIComponent(
    model
  )}/chat/completions?api-version=${encodeURIComponent(apiVersion || "2024-02-15-preview")}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    cache: "no-store",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, temperature }),
    timeoutMs,
  });
  const j = await res.json();
  if (!res.ok) throw buildProviderError({ res, body: j, url });
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic({ baseUrl, apiKey, model, messages, timeoutMs, temperature }) {
  const url = `${trimSlash(baseUrl)}/messages`;
  const system = messages.find((m) => m.role === "system")?.content || "";
  const msgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: m.content }],
    }));
  const res = await fetchWithTimeout(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      messages: msgs,
      temperature,
      max_tokens: 4096,
    }),
    timeoutMs,
  });
  const j = await res.json();
  if (!res.ok) throw buildProviderError({ res, body: j, url });
  return j?.content?.[0]?.text ?? "";
}

async function callGemini({ baseUrl, apiKey, model, messages, timeoutMs, temperature }) {
  const url = `${trimSlash(baseUrl)}/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = [
    ...(sys ? [{ role: "user", parts: [{ text: `SYSTEM:\n${sys}` }] }] : []),
    { role: "user", parts: [{ text: rest }] },
  ];
  const res = await fetchWithTimeout(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature } }),
    timeoutMs,
  });
  const j = await res.json();
  if (!res.ok) throw buildProviderError({ res, body: j, url });
  const content =
    j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return content;
}

// ---- Public client ----

export function createAiClient(explicitCfg) {
  const cfg = explicitCfg || getAiConfig();
  const providerId = cfg?.providerId || "openai";
  const provider = findProvider(providerId);
  const model = cfg.model || provider?.defaultModel || "gpt-4o-mini";
  const baseUrl = cfg.baseUrl || provider?.defaultBaseUrl || "";
  const apiKey = cfg.apiKey;
  const apiVersion = cfg.extra?.apiVersion;
  const temperature = (() => {
    const raw = cfg.extra?.temperature;
    if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_AI_TEMPERATURE;
    const num = Number(raw);
    if (!Number.isFinite(num)) return DEFAULT_AI_TEMPERATURE;
    return Math.min(2, Math.max(0, num));
  })();
  const REQUEST_TIMEOUT_MS =
    Number(cfg?.extra?.aiTimeoutMs) > 0 ? Number(cfg.extra.aiTimeoutMs) : DEFAULT_AI_TIMEOUT_MS;

  async function chat(messages) {
    if (!apiKey || !baseUrl || !model) throw new Error("AI not configured");
    if (providerId === "anthropic")
      return callAnthropic({ baseUrl, apiKey, model, messages, timeoutMs: REQUEST_TIMEOUT_MS, temperature });
    if (providerId === "gemini")
      return callGemini({ baseUrl, apiKey, model, messages, timeoutMs: REQUEST_TIMEOUT_MS, temperature });
    if (providerId === "azure-openai" || providerId === "azure_openai") {
      return callAzureOpenAI({ baseUrl, apiKey, model, apiVersion, messages, timeoutMs: REQUEST_TIMEOUT_MS, temperature });
    }
    // openai, openai-compatible, groq, together, mistral → OpenAI-compatible
    return callOpenAICompat({ baseUrl, apiKey, model, messages, timeoutMs: REQUEST_TIMEOUT_MS, temperature });
  }

  // --- Higher-level helpers used by the app (unchanged interfaces) ---

  async function cleanTextBatch(items, { languageHint } = {}) {
    const sys = [
      "You are a precise copy editor.",
      "Fix ONLY punctuation, spacing, capitalization, and obvious spelling mistakes.",
      "Do NOT paraphrase, shorten, expand, translate, or change tone/meaning.",
      "Preserve ALL Markdown, code blocks (```...```), inline code (`...`), and URLs exactly.",
      'Respond ONLY with strict JSON: {"items":[{"id":"...","text":"..."}, ...]}',
    ].join(" ");
    const user = [
      languageHint ? `Primary language: ${languageHint}.` : "Detect and keep the original language for each item.",
      "Items to minimally clean (JSON):",
      JSON.stringify({ items }, null, 2),
    ].join("\n");
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const parsed = parseJsonStrict(content);
    const out = Array.isArray(parsed?.items) ? parsed.items : [];
    const map = new Map(out.map((x) => [String(x.id), String(x.text ?? "")]));
    return items.map((it) => ({
      id: it.id,
      text: map.has(String(it.id)) ? map.get(String(it.id)) : it.text,
    }));
  }

  async function detectBaseLanguage(samples = []) {
    const sys = [
      "Detect the dominant language for the provided text samples.",
      'Return ONLY strict JSON: {"base":"<iso-2>","confidence":0.0-1.0}',
    ].join(" ");
    const joined = (samples || []).map((s) => String(s || "")).join("\n").slice(0, 4000);
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: joined },
    ]);
    const j = parseJsonStrict(content);
    return {
      base: String(j?.base || "en"),
      confidence: typeof j?.confidence === "number" ? j.confidence : 0,
    };
  }

  async function classifyLocales(texts = []) {
    const sys = [
      "Classify each text to a likely language code.",
      'Return ONLY strict JSON: {"items":[{"id":"...","lang":"en"}, ...]}',
    ].join(" ");
    const body = JSON.stringify(
      {
        items: texts.map((t, i) => ({
          id: String(i + 1),
          text: String(t || ""),
        })),
      },
      null,
      2
    );
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: body },
    ]);
    const j = parseJsonStrict(content);
    const arr = Array.isArray(j?.items) ? j.items : [];
    return arr.map((x) => ({ id: x.id, lang: x.lang }));
  }

  async function proposeTitle(baseLang, source) {
    let text = "";
    if (typeof source === "string") {
      text = source;
    } else if (source && typeof source === "object") {
      const parts = [];
      if (typeof source.body === "string" && source.body.trim()) parts.push(source.body);
      if (Array.isArray(source.chapters)) {
        for (const ch of source.chapters) {
          const b = ch && typeof ch.body === "string" ? ch.body : "";
          if (b.trim()) parts.push(b);
        }
      }
      text = parts.join("\n").slice(0, 4000);
    }
    const sys = [
      "You are an expert editor.",
      "Create a clear, concise title in the requested language.",
      "Constraints: 3–10 words, <= 60 characters, no quotes/emoji.",
      'Respond ONLY with strict JSON: {"title":"..."}',
    ].join(" ");
    const user = [`LANG: ${baseLang}`, "TEXT:", String(text || "")].join("\n");
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const j = parseJsonStrict(content);
    const raw = typeof j === "string" ? j : j && j.title;
    let title = typeof raw === "string" ? raw : "";
    title = title.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
    if (!title) throw new Error("no_title");
    if (title.length > 60) title = title.slice(0, 57).trimEnd() + "…";
    return title;
  }

  async function proposeChapterTitle(baseLang, { body, index }) {
    const text = String(body || "").slice(0, 8000);
    const sys = [
      "You are an expert editor.",
      "Create a clear, concise CHAPTER/SECTION title in the requested language.",
      "Constraints: 2–10 words, <= 60 characters, no quotes/emoji.",
      'Respond ONLY with strict JSON: {"title":"..."}',
    ].join(" ");
    const user = [`LANG: ${baseLang}`, `CHAPTER_INDEX: ${index}`, "TEXT:", text].join("\n");
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const j = parseJsonStrict(content);
    const title = String(j?.title || "").trim();
    if (!title) throw new Error("no_title");
    return title;
  }

  async function translateStructure(baseLang, targetLangs, structure) {
    const sys = [
      "You are a careful translator for a publishing workflow.",
      `Source language: ${baseLang}. Translate to ALL requested target languages.`,
      "Preserve Markdown formatting, code fences (```...```), inline code (`...`), links and URLs exactly.",
      "Do NOT translate code, URLs, or placeholders like {variable}. Keep chapter count and order identical.",
      'Respond ONLY with strict JSON of the form: {"translations":{"<lang>":{"title":"...","body":"...","chapters":[{"title":"...","body":"..."}, ...]}, ...}}',
    ].join(" ");
    const user = [
      `TARGET_LANGS: ${JSON.stringify(targetLangs)}`,
      "SOURCE_STRUCTURE:",
      JSON.stringify(structure, null, 2),
    ].join("\n");
    const content = await chat([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
    const j = parseJsonStrict(content);
    if (!j || typeof j !== "object" || !j.translations) throw new Error("no_translations");
    return j.translations;
  }

  return {
    chat,
    cleanTextBatch,
    detectBaseLanguage,
    classifyLocales,
    proposeTitle,
    proposeChapterTitle,
    translateStructure,
  };
}
