// src/ai/AIPostHandler.js
import { createSignal } from "solid-js";
import { snapshotBeforeAi, undoLastAi, dropLastAiSnapshot } from "./aiHistory.js";
import { createAiClient } from "./client.js";

function deepClone(v) { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } }
function normCode(c) { return c ? String(c).toLowerCase().slice(0, 2) : ""; }

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

// --- helpers for the new first-step normalization ---

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

  // Weighted score: prioritize substantial bodies & more chapters,
  // then let sheer size break ties.
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
  const active = normCode(activeLang);

  const maxScore = Math.max(...stats.map((s) => s.score));
  let bests = stats.filter((s) => s.score === maxScore);

  if (bests.length > 1) {
    const withBody = bests.filter((s) => s.hasBody);
    if (withBody.length) bests = withBody;
  }
  if (bests.length > 1 && active) {
    const fromActive = bests.find((s) => normCode(s.key) === active);
    if (fromActive) return fromActive;
  }
  // Final tie-breaker: largest total text
  bests.sort((a, b) => b.totalChars - a.totalChars);
  return bests[0];
}

// ---------- AI tasks ----------

function makeAnalyzeAiTask(t, opts) {
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

      // 1) Choose the "working" locale by content density
      const stats = locKeys.map((k) => _collectLocaleStats(state, k))
        .filter((s) => s.fieldsCount > 0 || s.totalChars > 0);

      const best = _pickBestLocale(stats, state?.activeLang);
      if (!best) throw new Error(t("editor.ai.errors.ambiguous"));

      // 2) Detect the actual human language of that content (ignoring the key)
      const ai = createAiClient();
      let res;
      const sampleTexts = _aggregateTextsForLocale(state, best.key).slice(0, 20); // cap size defensively
      try {
        res = await ai.detectBaseLanguage(sampleTexts, {
          activeLang: state?.activeLang,
          // Non-UI hint for your client; safe to ignore if unsupported:
          instruction:
            "Identify the single dominant language of the given content regardless of the locale key. " +
            "Return ISO 639-1 two-letter code in `base` plus numeric `confidence` 0..1.",
        });
      } catch (e) {
        // Don't hard-stop: we still can proceed with the best key if model is unsure.
        res = null;
      }

      const detected = normCode(res?.base);
      const baseLang = detected || normCode(best.key);
      if (!baseLang) throw new Error(t("editor.ai.errors.ambiguous"));

      // 3) Normalize state: keep only the chosen/real base language, move data if needed
      const next = deepClone(state);

      const chosenData = deepClone(state?.postData?.[best.key] || { title: "", body: "", chapters: [] });
      const chosenParams = deepClone(state?.postParams?.locales?.[best.key] || { chapters: [] });

      const prevSnapshot = JSON.stringify({
        pd: state?.postData || {},
        pp: state?.postParams?.locales || {},
        act: state?.activeLang || "",
      });

      next.postData = { [baseLang]: chosenData };

      const postParamsRest = { ...(state?.postParams || {}) };
      next.postParams = {
        ...postParamsRest,
        locales: { [baseLang]: chosenParams },
      };

      next.activeLang = baseLang;

      // 4) Meta for downstream tasks
      const supported = resolveSupportedLangs(opts, next);
      opts._setMeta?.({
        ...(opts._getMeta?.() || {}),
        analysis: {
          baseLang,
          confidence: res?.confidence ?? 0,
          normalizedFrom: normCode(best.key),
          supported,
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
      const baseLang = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseLang) throw new Error(t("editor.ai.errors.ambiguous"));

      const langData = state?.postData?.[baseLang];
      if (!langData) throw new Error(t("editor.ai.errors.nothingToClean"));

      const items = [];
      if (langData.body?.trim()) items.push({ id: "body", text: langData.body });
      if (typeof langData.title === "string" && langData.title.trim()) items.push({ id: "title", text: langData.title });
      if (Array.isArray(langData.chapters)) {
        langData.chapters.forEach((ch, i) => { if (ch?.body?.trim()) items.push({ id: `ch_${i}`, text: ch.body }); });
      }

      const paramsChs = state?.postParams?.locales?.[baseLang]?.chapters || [];
      paramsChs.forEach((cp, i) => {
        if (cp?.title && String(cp.title).trim()) items.push({ id: `cht_${i}`, text: String(cp.title) });
      });

      if (items.length === 0) throw new Error(t("editor.ai.errors.nothingToClean"));

      const ai = createAiClient();
      let cleaned;
      try { cleaned = await ai.cleanTextBatch(items, { languageHint: baseLang }); }
      catch { throw new Error(t("editor.ai.errors.api")); }

      const map = new Map(cleaned.map((x) => [x.id, x.text]));
      let changed = false;
      const next = deepClone(state);

      // postData content
      const nextLD = { ...(next.postData?.[baseLang] || {}) };
      if (langData.body?.trim() && map.has("body") && map.get("body") !== langData.body) { nextLD.body = map.get("body"); changed = true; }
      if (typeof langData.title === "string" && langData.title.trim() && map.has("title") && map.get("title") !== langData.title) {
        nextLD.title = map.get("title"); changed = true;
      }
      if (Array.isArray(langData.chapters)) {
        const chs = (langData.chapters || []).map((c) => ({ ...(c || {}) }));
        for (let i = 0; i < chs.length; i++) {
          if (chs[i]?.body?.trim() && map.has(`ch_${i}`) && map.get(`ch_${i}`) !== chs[i].body) {
            chs[i].body = map.get(`ch_${i}`); changed = true;
          }
        }
        nextLD.chapters = chs;
      }
      next.postData = { ...(next.postData || {}), [baseLang]: nextLD };

      // chapter titles -> postParams
      const locales = { ...(next.postParams?.locales || {}) };
      const langParams = { ...(locales[baseLang] || {}) };
      const chParams = Array.isArray(langParams.chapters) ? [...langParams.chapters] : [];
      const totalCh = Array.isArray(nextLD.chapters) ? nextLD.chapters.length : chParams.length;
      while (chParams.length < totalCh) chParams.push({});
      for (let i = 0; i < totalCh; i++) {
        const key = `cht_${i}`;
        if (map.has(key)) {
          const newTitle = map.get(key);
          if (typeof newTitle === "string" && newTitle !== (chParams[i]?.title || "")) {
            chParams[i] = { ...(chParams[i] || {}), title: newTitle };
            changed = true;
          }
        }
      }
      langParams.chapters = chParams;
      next.postParams = { ...(next.postParams || {}), locales: { ...locales, [baseLang]: langParams } };

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
      const baseLang = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseLang) throw new Error(t("editor.ai.errors.ambiguous"));

      const langData = state?.postData?.[baseLang] || { title: "", body: "", chapters: [] };
      const currentTitle = (langData.title || "").trim();
      if (currentTitle) return { state, modified: false };

      const hasText = !!(langData.body?.trim() || (Array.isArray(langData.chapters) && langData.chapters.some((c) => c?.body?.trim())));
      if (!hasText) throw new Error(t("editor.ai.errors.noContentForTitle"));

      const ai = createAiClient();
      let title;
      try { title = await ai.proposeTitle(baseLang, { body: langData.body || "", chapters: langData.chapters || [] }); }
      catch (e) { throw new Error(t("editor.ai.errors.api")); }

      let final = title.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
      if (!final) throw new Error(t("editor.ai.errors.noContentForTitle"));
      if (final.length > 90) final = final.slice(0, 87).trimEnd() + "…";

      const next = deepClone(state);
      const nextLD = { ...(next.postData?.[baseLang] || {}), title: final };
      next.postData = { ...(next.postData || {}), [baseLang]: nextLD };
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
      const baseLang = meta.analysis?.baseLang || normCode(state?.activeLang) || resolveSupportedLangs(opts, state)[0];
      if (!baseLang) throw new Error(t("editor.ai.errors.ambiguous"));

      const langData = state?.postData?.[baseLang];
      const chs = Array.isArray(langData?.chapters) ? langData.chapters : [];
      if (chs.length === 0) return { state, modified: false };

      const curParamsChapters = state?.postParams?.locales?.[baseLang]?.chapters || [];
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
          const tt = await ai.proposeChapterTitle(baseLang, { body: chs[i].body, index: i });
          let final = String(tt || "").replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
          if (final.length > 60) final = final.slice(0, 57).trimEnd() + "…";
          if (!final) continue;
          proposals.set(i, final);
        }
      } catch { throw new Error(t("editor.ai.errors.api")); }

      if (proposals.size === 0) return { state, modified: false };

      const next = deepClone(state);
      const locales = { ...(next.postParams?.locales || {}) };
      const langParams = { ...(locales[baseLang] || {}) };
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
      next.postParams = { ...(next.postParams || {}), locales: { ...locales, [baseLang]: langParams } };
      return { state: next, modified: true };
    },
  };
}

// ---------- NEW: one-shot translation task ----------
function makeTranslateAiTask(t, opts) {
  return {
    id: "translateAll",
    label: t("editor.ai.progress.translate"),
    run: async (state) => {
      const mode = typeof opts.editorMode === "function" ? opts.editorMode() : opts.editorMode;
      if (mode === "new_comment" || mode === "edit_comment") return { state, modified: false };

      const supported = resolveSupportedLangs(opts, state);
      const meta = opts._getMeta?.() || {};
      const base = meta.analysis?.baseLang || normCode(state?.activeLang) || supported[0];
      if (!base) throw new Error(t("editor.ai.errors.ambiguous"));

      const targets = supported.filter((x) => x !== base);
      if (targets.length === 0) return { state, modified: false };

      // Build source structure from base language
      const srcLD = state?.postData?.[base] || {};
      const srcChParams = state?.postParams?.locales?.[base]?.chapters || [];
      const chapters = Array.isArray(srcLD.chapters) ? srcLD.chapters : [];
      const sourceStruct = {
        title: String(srcLD.title || ""),
        body: String(srcLD.body || ""),
        chapters: chapters.map((c, i) => ({
          title: String(srcChParams[i]?.title || ""),
          body: String(c?.body || "")
        }))
      };

      const ai = createAiClient();
      let translations;
      try {
        translations = await ai.translateStructure(base, targets, sourceStruct);
      } catch {
        throw new Error(t("editor.ai.errors.api"));
      }

      // Apply atomically
      const next = deepClone(state);
      let changed = false;

      for (const lang of targets) {
        const tdata = translations?.[lang];
        if (!tdata) continue;

        // postData (title + body + chapter bodies)
        const cur = next.postData?.[lang] || {};
        const newTitle = typeof tdata.title === "string" ? tdata.title : cur.title || "";
        const newBody = typeof tdata.body === "string" ? tdata.body : cur.body || "";

        const srcChLen = sourceStruct.chapters.length;
        const tdChapters = Array.isArray(tdata.chapters) ? tdata.chapters : [];
        const mergedBodies = [];
        for (let i = 0; i < srcChLen; i++) {
          const tb = tdChapters[i]?.body;
          const curBody = cur.chapters?.[i]?.body || "";
          mergedBodies[i] = { ...(cur.chapters?.[i] || {}), body: typeof tb === "string" ? tb : curBody };
        }

        const nextContent = { ...cur, title: newTitle, body: newBody, chapters: mergedBodies };
        const prevSerialized = JSON.stringify(next.postData?.[lang] || {});
        const nextSerialized = JSON.stringify(nextContent);
        if (prevSerialized !== nextSerialized) {
          next.postData = { ...(next.postData || {}), [lang]: nextContent };
          changed = true;
        }

        // postParams.locales (chapter titles)
        const locales = { ...(next.postParams?.locales || {}) };
        const lp = { ...(locales[lang] || {}) };
        const curChParams = Array.isArray(lp.chapters) ? [...lp.chapters] : [];
        while (curChParams.length < srcChLen) curChParams.push({});
        for (let i = 0; i < srcChLen; i++) {
          const tt = tdChapters[i]?.title;
          if (typeof tt === "string" && tt !== (curChParams[i]?.title || "")) {
            curChParams[i] = { ...(curChParams[i] || {}), title: tt };
            changed = true;
          }
        }
        lp.chapters = curChParams;
        next.postParams = { ...(next.postParams || {}), locales: { ...locales, [lang]: lp } };
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
      // Order: analyze/normalize → clean texts & titles → make post title → make chapter titles → translate all
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

    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
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
      opts.onToast?.({ type: "error", message: err?.message || t("editor.ai.errors.unknown") });
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
