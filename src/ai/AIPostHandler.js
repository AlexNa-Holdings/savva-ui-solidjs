// src/ai/AIPostHandler.js
import { createSignal } from "solid-js";
import { snapshotBeforeAi, undoLastAi, dropLastAiSnapshot } from "./aiHistory.js";
import { createAiClient } from "./client.js";

function deepClone(v) { try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); } }
function normCode(c) { return c ? String(c).toLowerCase().slice(0, 2) : ""; }
function langAlias(c) { const x = normCode(c); return x === "ua" ? "uk" : x; }

// --- language utilities & preferred-key handling ---

const RE_LATIN = /[A-Za-z\u00C0-\u024F]/g;
const RE_CYR = /[\u0400-\u04FF]/g;
const RE_UK_SPEC = /[іїєґІЇЄҐ]/g;
const RE_RU_SPEC = /[ыэёЁЫЭ]/g;

function _scriptStats(s = "") {
  const text = String(s || "");
  return {
    latin: (text.match(RE_LATIN) || []).length,
    cyr: (text.match(RE_CYR) || []).length,
    ukSpec: (text.match(RE_UK_SPEC) || []).length,
    ruSpec: (text.match(RE_RU_SPEC) || []).length,
  };
}

function _looksLikeTargetScript(text, targetAliased) {
  const { latin, cyr } = _scriptStats(text);
  if (latin + cyr === 0) return false;
  if (targetAliased === "ru" || targetAliased === "uk") return cyr > 0 && latin === 0;
  return latin > 0 && cyr === 0;
}

function collectAllLocaleKeys(state) {
  const keys = new Set([
    ...Object.keys(state?.postData || {}),
    ...Object.keys(state?.postParams?.locales || {}),
  ].map(normCode).filter(Boolean));
  return Array.from(keys);
}

function pickPreferredLocaleKeyFor(langAliased, state) {
  const keys = collectAllLocaleKeys(state);
  if (langAliased === "uk") {
    if (keys.includes("ua")) return "ua";
    if (keys.includes("uk")) return "uk";
    return "ua";
  }
  return keys.includes(langAliased) ? langAliased : langAliased;
}

function guessLangByScript(texts = []) {
  const joined = String((texts || []).join("\n")) || "";
  const { latin, cyr, ukSpec, ruSpec } = _scriptStats(joined);
  if (cyr > latin) return ukSpec > ruSpec ? "uk" : "ru";
  if (latin > cyr) return "en";
  return ""; // inconclusive
}

// --- supported languages resolution ---

function resolveSupportedLangs(opts, state) {
  const fromOpts = Array.isArray(opts?.supportedLangs)
    ? opts.supportedLangs
    : typeof opts?.supportedLangs === "function"
      ? opts.supportedLangs()
      : null;
  const set = new Set(
    (fromOpts && fromOpts.length ? fromOpts
      : Object.keys(state?.postParams?.locales || state?.postData || {}))
      .map(normCode)
      .filter(Boolean)
  );
  return Array.from(set);
}

// --- helpers ---

function _trimLen(s) { return typeof s === "string" ? s.trim().length : 0; }

function _collectLocaleStats(state, key) {
  const pd = state?.postData?.[key] || {};
  const titleLen = _trimLen(pd.title);
  const bodyLen = _trimLen(pd.body);

  const chs = Array.isArray(pd.chapters) ? pd.chapters : [];
  let chBodiesCount = 0;
  let chBodiesChars = 0;
  for (const ch of chs) {
    const L = _trimLen(ch?.body);
    if (L) { chBodiesCount++; chBodiesChars += L; }
  }

  const paramsChs = state?.postParams?.locales?.[key]?.chapters || [];
  let chTitlesCount = 0;
  let chTitlesChars = 0;
  for (const cp of paramsChs) {
    const L = _trimLen(cp?.title);
    if (L) { chTitlesCount++; chTitlesChars += L; }
  }

  const totalChars = titleLen + bodyLen + chBodiesChars + chTitlesChars;
  const fieldsCount =
    (titleLen ? 1 : 0) +
    (bodyLen ? 1 : 0) +
    chBodiesCount +
    chTitlesCount;

  const score =
    fieldsCount * 1000 +
    (bodyLen ? 2000 : 0) +
    chBodiesCount * 500 +
    Math.floor(totalChars / 5);

  return {
    key,
    titleLen,
    bodyLen,
    chBodiesCount,
    chBodiesChars,
    chTitlesCount,
    chTitlesChars,
    totalChars,
    fieldsCount,
    hasBody: !!bodyLen,
    score,
  };
}

function _aggregateTextsForLocale(state, key) {
  const arr = [];
  const pd = state?.postData?.[key] || {};
  if (_trimLen(pd.title)) arr.push(pd.title);
  if (_trimLen(pd.body)) arr.push(pd.body);
  const chs = Array.isArray(pd.chapters) ? pd.chapters : [];
  for (const ch of chs) if (_trimLen(ch?.body)) arr.push(ch.body);
  const paramsChs = state?.postParams?.locales?.[key]?.chapters || [];
  for (const cp of paramsChs) if (_trimLen(cp?.title)) arr.push(String(cp.title));
  return arr;
}

function _pickBestLocale(stats, activeLang) {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  const maxScore = Math.max(...stats.map((s) => s.score));
  const active = normCode(activeLang);
  let bests = stats.filter((s) => s.score === maxScore);
  if (bests.length > 1) {
    const withBody = bests.filter((s) => s.hasBody);
    if (withBody.length) bests = withBody;
  }
  if (bests.length > 1 && active) {
    const fromActive = bests.find((s) => normCode(s.key) === active);
    if (fromActive) return fromActive;
  }
  bests.sort((a, b) => b.totalChars - a.totalChars);
  return bests[0];
}

// Markdown image handling (preserve attachments)
const IMG_MD_RE = /!\[[^\]]*]\([^)]+\)/g;
function extractImages(md = "") {
  return (md.match(IMG_MD_RE) || []).filter(Boolean);
}
function ensureImages(md = "", images = []) {
  let out = md || "";
  for (const tag of images) {
    if (!out.includes(tag)) out = (out ? out + "\n\n" : "") + tag;
  }
  return out;
}

// --- error plumbing for richer toasts ---

function sanitizeUrl(u) {
  if (!u) return "";
  try {
    const url = new URL(u, window.location.origin);
    return url.pathname + (url.search || "");
  } catch (e) {
    return String(u).replace(/^https?:\/\/[^/]+/, "");
  }
}

function extractErrorInfo(e) {
  try {
    const status = e?.status ?? e?.response?.status ?? e?.cause?.status;
    const code = e?.code ?? e?.cause?.code ?? e?.error?.code;
    const endpoint = e?.endpoint ?? e?.url ?? e?.config?.url ?? e?.response?.url;
    const requestId =
      e?.requestId ??
      e?.response?.headers?.get?.("x-request-id") ??
      e?.headers?.["x-request-id"] ??
      e?.cause?.requestId;
    return {
      status: typeof status === "number" ? status : undefined,
      code: code ? String(code) : undefined,
      endpoint: endpoint ? sanitizeUrl(endpoint) : undefined,
      requestId: requestId ? String(requestId) : undefined,
      rawMessage: e?.message ? String(e.message) : undefined,
    };
  } catch {
    return {};
  }
}

function makeApiError(t, original, ctx = {}) {
  const err = new Error(t("editor.ai.errors.api"));
  const info = extractErrorInfo(original || {});
  err._ai = {
    op: ctx.op,
    base: ctx.base,
    targets: Array.isArray(ctx.targets) ? ctx.targets : undefined,
    ...info,
  };
  return err;
}

function buildErrorDetails(t, err, ctx = {}) {
  const parts = [t("editor.ai.errors.api")];
  const step = ctx.taskLabel;
  if (step) parts.push(`${t("editor.ai.errors.atStep")}: ${step}`);

  const ai = err?._ai || {};
  const base = ai.base || ctx.base;
  const targets = ai.targets || ctx.targets;

  if (ai.op) parts.push(`${t("editor.ai.errors.operation")}: ${ai.op}`);
  if (base) parts.push(`${t("editor.ai.errors.base")}: ${String(base).toUpperCase()}`);
  if (Array.isArray(targets) && targets.length) {
    parts.push(`${t("editor.ai.errors.targets")}: ${targets.map((x) => String(x).toUpperCase()).join(", ")}`);
  }

  if (ai.status) parts.push(`${t("editor.ai.errors.status")}: ${ai.status}`);
  if (ai.code) parts.push(`${t("editor.ai.errors.code")}: ${ai.code}`);
  if (ai.endpoint) parts.push(`${t("editor.ai.errors.endpoint")}: ${ai.endpoint}`);
  if (ai.requestId) parts.push(`${t("editor.ai.errors.requestId")}: ${ai.requestId}`);

  const reason = ai.rawMessage || (err && err.message);
  if (reason && reason !== t("editor.ai.errors.api")) {
    parts.push(`${t("editor.ai.errors.reason")}: ${String(reason).slice(0, 300)}`);
  }

  return parts.join("\n");
}

// --- language detection / translation guards ---

async function detectLang(ai, text) {
  try {
    const res = await ai.detectBaseLanguage([String(text || "")], {
      instruction: "Return ISO 639-1 two-letter code in `base` plus numeric `confidence` 0..1.",
    });
    const base = langAlias(res?.base);
    const confidence = typeof res?.confidence === "number" ? res.confidence : 0;
    return { base, confidence };
  } catch {
    return { base: "", confidence: 0 };
  }
}

async function translateOne(ai, t, base, target, text) {
  try {
    if (typeof ai.translateText === "function") {
      return await ai.translateText(base, target, String(text || ""), {
        preserveMarkdown: true,
        instruction:
          "Translate to target language. Keep markdown images/links/code unchanged. Do not drop content.",
      });
    }
    const r = await ai.translateStructure(base, [target], {
      title: "",
      body: String(text || ""),
      chapters: [],
    }, {
      preserveMarkdown: true,
      instruction:
        "Translate to target language. Keep markdown images/links/code unchanged. Do not drop content.",
    });
    return r?.[target]?.body ?? "";
  } catch (e) {
    throw makeApiError(t, e, { op: "translateText", base, targets: [target] });
  }
}

function _eqLoose(a = "", b = "") {
  const norm = (x) =>
    String(x || "")
      .trim()
      .toLowerCase()
      .replace(/[.,;:!?…'"“”‘’`]+$/g, "")
      .replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

async function ensureTranslated(ai, t, base, target, sourceText, candidate) {
  const baseAliased = langAlias(base);
  const targetAliased = langAlias(target);
  const src = String(sourceText || "").trim();

  async function acceptIfLooksRight(text) {
    const val = String(text || "").trim();
    if (!val) return null;
    if (_eqLoose(val, src)) return null;
    const det = await detectLang(ai, val);
    if (det.base && det.base === targetAliased) return val;
    if (det.base && det.base !== targetAliased) return null;
    return _looksLikeTargetScript(val, targetAliased) ? val : null;
  }

  let ok = await acceptIfLooksRight(candidate);
  if (ok) return ok;

  for (let attempt = 0; attempt < 3; attempt++) {
    const tx = await translateOne(ai, t, baseAliased, targetAliased, src);
    ok = await acceptIfLooksRight(tx);
    if (ok) return ok;
  }

  return "";
}

// ---------- AI tasks ----------

function makeAnalyzeAiTask(t, opts) {
  const CONF_MIN = 0.7; // robust fallback if below this
  return {
    id: "analyze",
    label: t("editor.ai.progress.analyze"),
    run: async (state) => {
      const pd = state?.postData || {};
      const locKeys = Object.keys(pd);
      const textsExist = locKeys.some((k) => {
        const v = pd[k] || {};
        if (_trimLen(v.title)) return true;
        if (_trimLen(v.body)) return true;
        if (Array.isArray(v.chapters) && v.chapters.some((ch) => _trimLen(ch?.body))) return true;
        const paramsChs = state?.postParams?.locales?.[k]?.chapters || [];
        return paramsChs.some((cp) => _trimLen(cp?.title));
      });

      if (!textsExist) throw new Error(t("editor.ai.errors.empty"));

      const originalLocales = collectAllLocaleKeys(state);

      const stats = locKeys.map((k) => _collectLocaleStats(state, k))
        .filter((s) => s.fieldsCount > 0 || s.totalChars > 0);
      const statsByKey = new Map(stats.map((s) => [normCode(s.key), s]));
      const best = _pickBestLocale(stats, state?.activeLang);

      const topForDetection = stats
        .slice().sort((a, b) => b.totalChars - a.totalChars)
        .slice(0, 3)
        .flatMap((s) => _aggregateTextsForLocale(state, s.key))
        .slice(0, 40);

      const ai = createAiClient();
      let res;
      try {
        res = await ai.detectBaseLanguage(topForDetection, {
          activeLang: state?.activeLang,
          instruction:
            "Identify the single dominant language of the given content regardless of the locale key. " +
            "Return ISO 639-1 code in `base` plus numeric `confidence` 0..1.",
        });
      } catch {
        res = null;
      }

      const detectedRaw = langAlias(res?.base);
      const conf = typeof res?.confidence === "number" ? res.confidence : 0;
      const scriptGuess = guessLangByScript(topForDetection);
      // prefer API when confident, otherwise use script; also fix obvious contradictions
      let baseAliased = detectedRaw && conf >= CONF_MIN ? detectedRaw : (scriptGuess || detectedRaw || "");
      if (detectedRaw === "en" && (scriptGuess === "ru" || scriptGuess === "uk")) baseAliased = scriptGuess;
      if (!baseAliased) baseAliased = normCode(best?.key); // last resort

      if (!baseAliased) throw new Error(t("editor.ai.errors.ambiguous"));

      // choose a storage key for the base language (ua vs uk)
      const baseKey = pickPreferredLocaleKeyFor(baseAliased, state);

      // pick where to copy the source data from
      const sourceKey =
        (statsByKey.get(baseKey)?.totalChars || 0) > 0
          ? baseKey
          : (statsByKey.get(baseAliased)?.totalChars || 0) > 0
            ? statsByKey.get(baseAliased).key
            : stats.slice().sort((a, b) => b.totalChars - a.totalChars)[0]?.key || best.key;

      const next = deepClone(state);

      const chosenData = deepClone(state?.postData?.[sourceKey] || { title: "", body: "", chapters: [] });
      const chosenParams = deepClone(state?.postParams?.locales?.[sourceKey] || { chapters: [] });

      const prevSnapshot = JSON.stringify({
        pd: state?.postData || {},
        pp: state?.postParams?.locales || {},
        act: state?.activeLang || "",
      });

      // rebase into the proper baseKey
      next.postData = { [baseKey]: chosenData };
      const postParamsRest = { ...(state?.postParams || {}) };
      next.postParams = { ...postParamsRest, locales: { [baseKey]: chosenParams } };
      next.activeLang = baseKey;

      const supportedAfter = resolveSupportedLangs(opts, next);
      const supportedBefore = resolveSupportedLangs(opts, state);
      const initialLocales = supportedBefore.length ? supportedBefore : originalLocales;

      const normalizedFrom = normCode(sourceKey);
      const targetsAtStart = Array.from(
        new Set([...initialLocales, normalizedFrom].map(normCode).filter((x) => x && x !== baseKey))
      );

      opts._setMeta?.({
        ...(opts._getMeta?.() || {}),
        analysis: {
          baseLang: baseAliased,    // ru/uk/en
          baseKey,                  // ru/en/fr/ua (preferred storage key)
          confidence: conf ?? 0,
          normalizedFrom,
          supported: supportedAfter,
          initialLocales,
          targetsAtStart,
        },
      });

      const nextSnapshot = JSON.stringify({
        pd: next?.postData || {},
        pp: next?.postParams?.locales || {},
        act: next?.activeLang || "",
      });

      const changed = prevSnapshot !== nextSnapshot;
      return { state: changed ? next : state, modified: changed };
    },
  };
}

function makeCleanOriginalAiTask(t, opts) {
  return {
    id: "cleanOriginal",
    label: t("editor.ai.progress.cleanText"),
    run: async (state) => {
      const mode = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
      if (mode === "new_comment" || mode === "edit_comment") return { state, modified: false };

      const meta = opts._getMeta?.() || {};
      const baseAliased = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseAliased) throw new Error(t("editor.ai.errors.ambiguous"));

      const baseKey = meta.analysis?.baseKey || normCode(state?.activeLang) || baseAliased;

      const langData = state?.postData?.[baseKey];
      if (!langData) throw new Error(t("editor.ai.errors.nothingToClean"));

      const items = [];
      if (langData.body?.trim()) items.push({ id: "body", text: langData.body });
      if (typeof langData.title === "string" && langData.title.trim()) items.push({ id: "title", text: langData.title });
      if (Array.isArray(langData.chapters)) {
        langData.chapters.forEach((ch, i) => { if (ch?.body?.trim()) items.push({ id: `ch_${i}`, text: ch.body }); });
      }

      const paramsChs = state?.postParams?.locales?.[baseKey]?.chapters || [];
      paramsChs.forEach((cp, i) => {
        if (cp?.title && String(cp.title).trim()) items.push({ id: `cht_${i}`, text: String(cp.title) });
      });

      if (items.length === 0) throw new Error(t("editor.ai.errors.nothingToClean"));

      const ai = createAiClient();
      let cleaned;
      try { cleaned = await ai.cleanTextBatch(items, { languageHint: baseAliased }); }
      catch (e) { throw makeApiError(t, e, { op: "cleanTextBatch", base: baseAliased }); }

      const map = new Map(cleaned.map((x) => [x.id, x.text]));
      let changed = false;
      const next = deepClone(state);

      const nextLD = { ...(next.postData?.[baseKey] || {}) };

      if (langData.body?.trim() && map.has("body")) {
        const newBody = String(map.get("body") ?? "");
        if (newBody.trim() && newBody !== langData.body) { nextLD.body = newBody; changed = true; }
      }

      if (typeof langData.title === "string" && langData.title.trim() && map.has("title")) {
        const newTitle = String(map.get("title") ?? "");
        if (newTitle.trim() && newTitle !== langData.title) { nextLD.title = newTitle; changed = true; }
      }

      if (Array.isArray(langData.chapters)) {
        const chs = (langData.chapters || []).map((c) => ({ ...(c || {}) }));
        for (let i = 0; i < chs.length; i++) {
          const key = `ch_${i}`;
          if (chs[i]?.body?.trim() && map.has(key)) {
            const nb = String(map.get(key) ?? "");
            if (nb.trim() && nb !== chs[i].body) { chs[i].body = nb; changed = true; }
          }
        }
        nextLD.chapters = chs;
      }

      next.postData = { ...(next.postData || {}), [baseKey]: nextLD };

      const locales = { ...(next.postParams?.locales || {}) };
      const langParams = { ...(locales[baseKey] || {}) };
      const chParams = Array.isArray(langParams.chapters) ? [...langParams.chapters] : [];
      const totalCh = Array.isArray(nextLD.chapters) ? nextLD.chapters.length : chParams.length;
      while (chParams.length < totalCh) chParams.push({});
      for (let i = 0; i < totalCh; i++) {
        const key = `cht_${i}`;
        if (map.has(key)) {
          const newTitle = String(map.get(key) ?? "");
          if (newTitle.trim() && newTitle !== (chParams[i]?.title || "")) {
            chParams[i] = { ...(chParams[i] || {}), title: newTitle };
            changed = true;
          }
        }
      }
      langParams.chapters = chParams;
      next.postParams = { ...(next.postParams || {}), locales: { ...locales, [baseKey]: langParams } };

      if (!changed) return { state, modified: false };
      return { state: next, modified: true };
    },
  };
}

function makeTitleAiTask(t, opts) {
  return {
    id: "makeTitle",
    label: t("editor.ai.progress.makeTitle"),
    run: async (state) => {
      const mode = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
      if (mode === "new_comment" || mode === "edit_comment") return { state, modified: false };

      const meta = opts._getMeta?.() || {};
      const baseAliased = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseAliased) throw new Error(t("editor.ai.errors.ambiguous"));
      const baseKey = meta.analysis?.baseKey || normCode(state?.activeLang) || baseAliased;

      const langData = state?.postData?.[baseKey] || { title: "", body: "", chapters: [] };
      const currentTitle = (langData.title || "").trim();
      if (currentTitle) return { state, modified: false };

      const hasText = !!(langData.body?.trim() || (Array.isArray(langData.chapters) && langData.chapters.some((c) => c?.body?.trim())));
      if (!hasText) throw new Error(t("editor.ai.errors.noContentForTitle"));

      const ai = createAiClient();
      let title;
      try { title = await ai.proposeTitle(baseAliased, { body: langData.body || "", chapters: langData.chapters || [] }); }
      catch (e) { throw makeApiError(t, e, { op: "proposeTitle", base: baseAliased }); }

      let final = String(title || "").replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
      if (!final) throw new Error(t("editor.ai.errors.noContentForTitle"));
      if (final.length > 90) final = final.slice(0, 87).trimEnd() + "…";

      const next = deepClone(state);
      const nextLD = { ...(next.postData?.[baseKey] || {}), title: final };
      next.postData = { ...(next.postData || {}), [baseKey]: nextLD };
      return { state: next, modified: true };
    },
  };
}

function makeChapterTitlesAiTask(t, opts) {
  return {
    id: "makeChapterTitles",
    label: t("editor.ai.progress.makeChapterTitles"),
    run: async (state) => {
      const mode = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
      if (mode === "new_comment" || mode === "edit_comment") return { state, modified: false };

      const meta = opts._getMeta?.() || {};
      const baseAliased = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseAliased) throw new Error(t("editor.ai.errors.ambiguous"));
      const baseKey = meta.analysis?.baseKey || normCode(state?.activeLang) || baseAliased;

      const langData = state?.postData?.[baseKey];
      const chs = Array.isArray(langData?.chapters) ? langData.chapters : [];
      if (chs.length === 0) return { state, modified: false };

      const curParamsChapters = state?.postParams?.locales?.[baseKey]?.chapters || [];
      const targets = [];
      for (let i = 0; i < chs.length; i++) {
        const hasBody = !!(chs[i]?.body && chs[i].body.trim());
        const hasTitle = !!(curParamsChapters[i]?.title && String(curParamsChapters[i].title).trim());
        if (hasBody && !hasTitle) targets.push(i);
      }
      if (targets.length === 0) return { state, modified: false };

      const ai = createAiClient();
      const proposals = new Map();
      try {
        for (const i of targets) {
          const tt = await ai.proposeChapterTitle(baseAliased, { body: chs[i].body, index: i });
          let final = String(tt || "").replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
          if (final.length > 60) final = final.slice(0, 57).trimEnd() + "…";
          if (!final) continue;
          proposals.set(i, final);
        }
      } catch (e) { throw makeApiError(t, e, { op: "proposeChapterTitle", base: baseAliased }); }

      if (proposals.size === 0) return { state, modified: false };

      const next = deepClone(state);
      const locales = { ...(next.postParams?.locales || {}) };
      const langParams = { ...(locales[baseKey] || {}) };
      const chParams = Array.isArray(langParams.chapters) ? [...langParams.chapters] : [];
      while (chParams.length < chs.length) chParams.push({});
      let changed = false;
      for (const [i, title] of proposals.entries()) {
        if (!chParams[i]?.title || String(chParams[i].title).trim() === "") {
          chParams[i] = { ...(chParams[i] || {}), title };
          changed = true;
        }
      }
      if (!changed) return { state, modified: false };
      langParams.chapters = chParams;
      next.postParams = { ...(next.postParams || {}), locales: { ...locales, [baseKey]: langParams } };
      return { state: next, modified: true };
    },
  };
}

function makeTranslateAiTask(t, opts) {
  return {
    id: "translateAll",
    label: t("editor.ai.progress.translate"),
    run: async (state) => {
      const mode = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
      if (mode === "new_comment" || mode === "edit_comment") return { state, modified: false };

      const meta = opts._getMeta?.() || {};
      const supportedNow = resolveSupportedLangs(opts, state);

      const baseAliased = meta.analysis?.baseLang || normCode(state?.activeLang) || supportedNow[0];
      if (!baseAliased) throw new Error(t("editor.ai.errors.ambiguous"));
      const baseKey = meta.analysis?.baseKey || normCode(state?.activeLang) || baseAliased;

      const targetsFromMeta = Array.isArray(meta.analysis?.targetsAtStart) ? meta.analysis.targetsAtStart : [];
      const targets = Array.from(new Set(
        [...targetsFromMeta, ...supportedNow].map(normCode).filter((x) => x && x !== baseKey)
      ));
      if (targets.length === 0) return { state, modified: false };

      const srcLD = state?.postData?.[baseKey] || {};
      const srcChParams = state?.postParams?.locales?.[baseKey]?.chapters || [];
      const chapters = Array.isArray(srcLD.chapters) ? srcLD.chapters : [];
      const sourceStruct = {
        title: String(srcLD.title || ""),
        body: String(srcLD.body || ""),
        chapters: chapters.map((c, i) => ({
          title: String(srcChParams[i]?.title || ""),
          body: String(c?.body || "")
        }))
      };

      const baseImages = extractImages(sourceStruct.body);

      const ai = createAiClient();
      let translations;
      try {
        translations = await ai.translateStructure(baseAliased, targets, sourceStruct, {
          preserveMarkdown: true,
          instruction:
            "Translate all text fields into the target locale. Keep markdown images/links/code unchanged. Do not drop content.",
        });
      } catch (e) {
        throw makeApiError(t, e, { op: "translateStructure", base: baseAliased, targets });
      }

      const next = deepClone(state);
      let changed = false;

      for (const lang of targets) {
        const tdata = translations?.[lang] || {};
        const target = normCode(lang);
        const targetAliased = langAlias(target);

        // BODY
        let newBody = await ensureTranslated(ai, t, baseAliased, targetAliased, sourceStruct.body, tdata.body);
        newBody = ensureImages(newBody, baseImages);

        // TITLE
        let newTitle = await ensureTranslated(ai, t, baseAliased, targetAliased, sourceStruct.title, tdata.title);

        // CHAPTERS
        const srcChLen = sourceStruct.chapters.length;
        const tdChapters = Array.isArray(tdata.chapters) ? tdata.chapters : [];
        const mergedBodies = [];
        const mergedChParams = [];

        for (let i = 0; i < srcChLen; i++) {
          const srcChBody = sourceStruct.chapters[i]?.body || "";
          const srcChTitle = sourceStruct.chapters[i]?.title || "";

          let cb = await ensureTranslated(ai, t, baseAliased, targetAliased, srcChBody, tdChapters[i]?.body);
          let ct = await ensureTranslated(ai, t, baseAliased, targetAliased, srcChTitle, tdChapters[i]?.title);

          mergedBodies[i] = { ...(next.postData?.[target]?.chapters?.[i] || {}), body: cb };
          mergedChParams[i] = { title: ct };
        }

        // Apply to postData
        const nextContent = {
          title: newTitle,
          body: newBody,
          chapters: mergedBodies,
        };
        const prevSerialized = JSON.stringify(next.postData?.[target] || {});
        const nextSerialized = JSON.stringify(nextContent);
        if (prevSerialized !== nextSerialized) {
          next.postData = { ...(next.postData || {}), [target]: nextContent };
          changed = true;
        }

        // Apply chapter titles to postParams
        const locales = { ...(next.postParams?.locales || {}) };
        const lp = { ...(locales[target] || {}) };
        const curChParams = Array.isArray(lp.chapters) ? [...lp.chapters] : [];
        while (curChParams.length < mergedChParams.length) curChParams.push({});
        for (let i = 0; i < mergedChParams.length; i++) {
          const tt = mergedChParams[i]?.title || "";
          if (tt !== (curChParams[i]?.title || "")) {
            curChParams[i] = { ...(curChParams[i] || {}), title: tt };
            changed = true;
          }
        }
        lp.chapters = curChParams;
        next.postParams = { ...(next.postParams || {}), locales: { ...locales, [target]: lp } };
      }

      // Final verification pass: fix any locale that still carries base-language text
      try {
        const locales = Object.keys(next.postData || {});
        const ai2 = ai;
        for (const key of locales) {
          if (key === baseKey) continue;
          const targetAliased = langAlias(key);
          const cur = next.postData[key] || {};
          const fixField = async (srcText, cand, assign) => {
            const fixed = await ensureTranslated(ai2, t, baseAliased, targetAliased, srcText, cand);
            if (fixed && fixed !== cand) { assign(fixed); changed = true; }
          };
          await fixField(sourceStruct.body, cur.body || "", (v) => {
            next.postData[key] = { ...(next.postData[key] || {}), body: ensureImages(v, baseImages) };
          });
          await fixField(sourceStruct.title, cur.title || "", (v) => {
            next.postData[key] = { ...(next.postData[key] || {}), title: v };
          });
          const chs = Array.isArray(sourceStruct.chapters) ? sourceStruct.chapters : [];
          const curChs = Array.isArray(cur.chapters) ? cur.chapters : [];
          const newChs = curChs.map((c) => ({ ...(c || {}) }));
          for (let i = 0; i < chs.length; i++) {
            const srcB = chs[i]?.body || "";
            const srcT = chs[i]?.title || "";
            const candB = newChs[i]?.body || "";
            const candT = (next.postParams?.locales?.[key]?.chapters?.[i]?.title) || "";
            const fixedBody = await ensureTranslated(ai2, t, baseAliased, targetAliased, srcB, candB);
            if (fixedBody && fixedBody !== candB) { newChs[i] = { ...(newChs[i] || {}), body: fixedBody }; changed = true; }
            const fixedTitle = await ensureTranslated(ai2, t, baseAliased, targetAliased, srcT, candT);
            if (fixedTitle && fixedTitle !== candT) {
              const localesMap = { ...(next.postParams?.locales || {}) };
              const lp = { ...(localesMap[key] || {}) };
              const chParams = Array.isArray(lp.chapters) ? [...lp.chapters] : [];
              while (chParams.length <= i) chParams.push({});
              chParams[i] = { ...(chParams[i] || {}), title: fixedTitle };
              lp.chapters = chParams;
              next.postParams = { ...(next.postParams || {}), locales: { ...localesMap, [key]: lp } };
              changed = true;
            }
          }
          next.postData[key] = { ...(next.postData[key] || {}), chapters: newChs };
        }
      } catch {
        // ignore verification errors – better to return partial than fail
      }

      if (!changed) return { state, modified: false };
      return { state: next, modified: true };
    },
  };
}

// ---------- Handler ----------
/**
 * createAIPostHandler({
 *   draftKey, readState, applyState, t, onToast,
 *   supportedLangs?: string[] | () => string[],
 *   editorMode?: string | () => string
 * })
 */
export function createAIPostHandler(opts) {
  const { draftKey, readState, applyState, t } = opts;

  const [running, setRunning] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [progress, setProgress] = createSignal({ i: 0, total: 0, label: "" });
  const [meta, setMeta] = createSignal({});

  const isPostMode = () => {
    const m = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
    return m === "new_post" || m === "edit_post";
  };

  const tasksSupplier = () => {
    const tasks = [makeAnalyzeAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta })];
    if (isPostMode()) {
      tasks.push(makeCleanOriginalAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
      tasks.push(makeTitleAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
      tasks.push(makeChapterTitlesAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
      tasks.push(makeTranslateAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
    }
    return tasks;
  };

  async function run() {
    const before = readState();
    snapshotBeforeAi(draftKey, before, { reason: "ai-run" });

    const tasks = tasksSupplier();
    setRunning(true);
    setPending(false);
    setProgress({ i: 0, total: tasks.length, label: "" });

    let state = before;
    let modified = false;
    let lastTaskLabel = "";

    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        lastTaskLabel = task.label;
        setProgress({ i, total: tasks.length, label: task.label });
        // eslint-disable-next-line no-await-in-loop
        const res = await task.run(state, { t, getMeta: meta, setMeta });
        if (res && typeof res === "object" && "state" in res) {
          state = res.state;
          modified = modified || !!res.modified;
        } else {
          state = res;
        }
      }

      applyState(state);
      setRunning(false);

      if (modified) {
        setPending(true);
        opts.onToast?.({ type: "info", message: t("editor.ai.applied") });
      } else {
        setPending(false);
        dropLastAiSnapshot(draftKey);
        opts.onToast?.({ type: "success", message: t("editor.ai.analysisComplete") });
      }
    } catch (err) {
      setRunning(false);
      setPending(false);
      dropLastAiSnapshot(draftKey);

      const m = meta() || {};
      const base = m?.analysis?.baseLang;
      const targets = Array.isArray(m?.analysis?.targetsAtStart) ? m.analysis.targetsAtStart : undefined;

      const brief = lastTaskLabel ? `${t("editor.ai.errors.api")} — ${lastTaskLabel}` : t("editor.ai.errors.api");
      const details = err?._ai
        ? buildErrorDetails(t, err, { taskLabel: lastTaskLabel, base, targets })
        : (err?.message || t("editor.ai.errors.unknown"));

      opts.onToast?.({ type: "error", message: brief, details });
    }
  }

  function undo() {
    const prev = undoLastAi(draftKey);
    if (prev) applyState(prev);
    setPending(false);
  }

  function confirm() {
    dropLastAiSnapshot(draftKey);
    setPending(false);
  }

  return { pending, running, progress, run, undo, confirm, meta };
}
