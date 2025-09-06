// src/ai/client.js
import { getAiConfig } from "./storage.js";
import { fetchWithTimeout } from "../utils/net.js";

function trimSlash(s = "") { return String(s || "").replace(/\/+$/, ""); }
function safeModel(cfg) { return cfg.model || "gpt-4o-mini"; }

function parseJsonStrict(s) {
  const raw = String(s || "").trim();
  try { return JSON.parse(raw); } catch {}
  const m = raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
  if (m && m[1]) { try { return JSON.parse(m[1]); } catch {} }
  const b = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (b >= 0 && e > b) { try { return JSON.parse(raw.slice(b, e + 1)); } catch {} }
  throw new Error("Bad JSON from AI");
}

async function callOpenAICompat({ baseUrl, apiKey, model, messages }) {
  const url = `${trimSlash(baseUrl)}/chat/completions`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2 })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || res.statusText);
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callAzureOpenAI({ baseUrl, apiKey, model, apiVersion, messages }) {
  const url = `${trimSlash(baseUrl)}/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(apiVersion || "2024-02-15-preview")}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, temperature: 0.2 })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || res.statusText);
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic({ baseUrl, apiKey, model, messages }) {
  const url = `${trimSlash(baseUrl)}/messages`;
  const system = messages.find((m) => m.role === "system")?.content || "";
  const msgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: [{ type: "text", text: m.content }] }));
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, system, messages: msgs, temperature: 0.2, max_tokens: 4096 })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || res.statusText);
  return j?.content?.[0]?.text ?? "";
}

async function callGemini({ baseUrl, apiKey, model, messages }) {
  const url = `${trimSlash(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const sys = messages.find((m) => m.role === "system")?.content || "";
  const rest = messages.filter((m) => m.role !== "system").map((m) => m.content).join("\n\n");
  const contents = [
    ...(sys ? [{ role: "user", parts: [{ text: `SYSTEM:\n${sys}` }] }] : []),
    { role: "user", parts: [{ text: rest }] }
  ];
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.2 } })
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || res.statusText);
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

export function createAiClient(explicitCfg) {
  const cfg = explicitCfg || getAiConfig();
  const kind = cfg?.providerId || "openai";
  const model = safeModel(cfg);
  const baseUrl = cfg.baseUrl;
  const apiKey = cfg.apiKey;
  const apiVersion = cfg.extra?.apiVersion;

  async function chat(messages) {
    if (!apiKey || !baseUrl || !model) throw new Error("AI not configured");
    if (kind === "anthropic") return callAnthropic({ baseUrl, apiKey, model, messages });
    if (kind === "gemini") return callGemini({ baseUrl, apiKey, model, messages });
    if (kind === "azure-openai" || kind === "azure_openai")
      return callAzureOpenAI({ baseUrl, apiKey, model, apiVersion, messages });
    return callOpenAICompat({ baseUrl, apiKey, model, messages });
  }

  async function cleanTextBatch(items, { languageHint } = {}) {
    const sys = [
      "You are a precise copy editor.",
      "Fix ONLY punctuation, spacing, capitalization, and obvious spelling mistakes.",
      "Do NOT paraphrase, shorten, expand, translate, or change tone/meaning.",
      "Preserve ALL Markdown, code blocks (```...```), inline code (`...`), and URLs exactly.",
      'Respond ONLY with strict JSON: {"items":[{"id":"...","text":"..."}, ...]}'
    ].join(" ");
    const user = [
      languageHint ? `Primary language: ${languageHint}.` : "Detect and keep the original language for each item.",
      "Items to minimally clean (JSON):",
      JSON.stringify({ items }, null, 2)
    ].join("\n");
    const content = await chat([{ role: "system", content: sys }, { role: "user", content: user }]);
    const parsed = parseJsonStrict(content);
    const out = Array.isArray(parsed?.items) ? parsed.items : [];
    const map = new Map(out.map((x) => [String(x.id), String(x.text ?? "")]));
    return items.map((it) => ({ id: it.id, text: map.has(String(it.id)) ? map.get(String(it.id)) : it.text }));
  }

  async function detectBaseLanguage(texts, { supportedLangs = [], activeLang } = {}) {
    const chunks = (texts || []).map((t) => String(t || "").slice(0, 4000)).filter(Boolean);
    const sys = [
      "You are a strict language detector for an editorial pipeline.",
      "Choose ONE base language code for the document from the ALLOWED list only.",
      "Consider that some parts may be mislabeled; infer by content.",
      "If you are NOT confident (or not enough text), return an error.",
      'Respond ONLY with strict JSON like: {"base":"en","confidence":0.83} OR {"error":"ambiguous"}'
    ].join(" ");
    const user = [
      `ALLOWED: ${JSON.stringify(supportedLangs)}`,
      activeLang ? `ACTIVE_UI_HINT: ${activeLang}` : "",
      "TEXTS:",
      JSON.stringify(chunks, null, 2)
    ].join("\n");
    const content = await chat([{ role: "system", content: sys }, { role: "user", content: user }]);
    const j = parseJsonStrict(content);
    if (j?.error) throw new Error(String(j.error));
    const base = String(j?.base || "").toLowerCase().slice(0, 2);
    const confidence = Number(j?.confidence ?? 0);
    if (!base || !supportedLangs.map((x) => x.toLowerCase().slice(0, 2)).includes(base)) {
      throw new Error("unsupported");
    }
    return { base, confidence: isFinite(confidence) ? confidence : 0 };
  }

  async function proposeTitle(baseLang, { body, chapters }) {
    const parts = [];
    if (body) parts.push(String(body));
    if (Array.isArray(chapters)) for (const ch of chapters) if (ch?.body) parts.push(String(ch.body));
    const text = parts.join("\n").slice(0, 8000);
    const sys = [
      "You are an expert headline editor.",
      "Create a concise, compelling post title in the requested language.",
      "Constraints: 4–14 words, <= 90 characters, no quotes/emoji, sentence or title case as appropriate.",
      'Respond ONLY with strict JSON: {"title":"..."}'
    ].join(" ");
    const user = [`LANG: ${baseLang}`, "TEXT:", text].join("\n");
    const content = await chat([{ role: "system", content: sys }, { role: "user", content: user }]);
    const j = parseJsonStrict(content);
    const title = String(j?.title || "").trim();
    if (!title) throw new Error("no_title");
    return title;
  }

  async function proposeChapterTitle(baseLang, { body, index }) {
    const text = String(body || "").slice(0, 8000);
    const sys = [
      "You are an expert editor.",
      "Create a clear, concise CHAPTER/SECTION title in the requested language.",
      "Constraints: 2–10 words, <= 60 characters, no quotes/emoji.",
      'Respond ONLY with strict JSON: {"title":"..."}'
    ].join(" ");
    const user = [`LANG: ${baseLang}`, `CHAPTER_INDEX: ${index}`, "TEXT:", text].join("\n");
    const content = await chat([{ role: "system", content: sys }, { role: "user", content: user }]);
    const j = parseJsonStrict(content);
    const title = String(j?.title || "").trim();
    if (!title) throw new Error("no_title");
    return title;
  }

  return { cleanTextBatch, detectBaseLanguage, proposeTitle, proposeChapterTitle };
}
