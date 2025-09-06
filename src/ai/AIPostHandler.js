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

// ---------- AI tasks already in your flow (analyze, clean, title, chapter titles) ----------
// (Unchanged from your latest version; included here only where relevant differences exist)

function makeAnalyzeAiTask(t, opts) {
  return {
    id: "analyze",
    label: t("editor.ai.progress.analyze"),
    run: async (state) => {
      const supported = resolveSupportedLangs(opts, state);
      const pd = state?.postData || {};
      const texts = [];
      for (const k of Object.keys(pd)) {
        const v = pd[k] || {};
        if (v.title?.trim()) texts.push(v.title);
        if (v.body?.trim()) texts.push(v.body);
        if (Array.isArray(v.chapters)) for (const ch of v.chapters) if (ch?.body?.trim()) texts.push(ch.body);
      }
      if (texts.length === 0) throw new Error(t("editor.ai.errors.empty"));

      const ai = createAiClient();
      let res;
      try {
        res = await ai.detectBaseLanguage(texts, { supportedLangs: supported, activeLang: state?.activeLang });
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("ambig")) throw new Error(t("editor.ai.errors.ambiguous"));
        if (msg.includes("unsupported")) throw new Error(t("editor.ai.errors.unsupported"));
        throw new Error(t("editor.ai.errors.api"));
      }

      const baseLang = normCode(res.base);
      if (!baseLang) throw new Error(t("editor.ai.errors.ambiguous"));

      opts._setMeta?.({
        ...(opts._getMeta?.() || {}),
        analysis: { baseLang, confidence: res.confidence ?? 0, supported },
      });

      return { state, modified: false };
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
      // Order: analyze → clean texts & titles → make post title → make chapter titles → translate all
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
