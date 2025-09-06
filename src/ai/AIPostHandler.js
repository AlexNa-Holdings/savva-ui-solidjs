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

// ---------- AI tasks ----------
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
        langData.chapters.forEach((ch, i) => {
          if (ch?.body?.trim()) items.push({ id: `ch_${i}`, text: ch.body });
          if (typeof ch?.title === "string" && ch.title.trim()) items.push({ id: `cht_${i}`, text: ch.title });
        });
      }
      if (items.length === 0) throw new Error(t("editor.ai.errors.nothingToClean"));

      const ai = createAiClient();
      let cleaned;
      try {
        cleaned = await ai.cleanTextBatch(items, { languageHint: baseLang });
      } catch {
        throw new Error(t("editor.ai.errors.api"));
      }

      // Apply atomically
      const map = new Map(cleaned.map((x) => [x.id, x.text]));
      let changed = false;
      const next = deepClone(state);
      const ld = { ...(next.postData?.[baseLang] || {}) };

      if (langData.body?.trim() && map.has("body") && map.get("body") !== langData.body) { ld.body = map.get("body"); changed = true; }
      if (typeof langData.title === "string" && langData.title.trim() && map.has("title") && map.get("title") !== langData.title) {
        ld.title = map.get("title"); changed = true;
      }

      if (Array.isArray(langData.chapters)) {
        const chs = (langData.chapters || []).map((c) => ({ ...(c || {}) }));
        for (let i = 0; i < chs.length; i++) {
          if (chs[i]?.body?.trim() && map.has(`ch_${i}`) && map.get(`ch_${i}`) !== chs[i].body) {
            chs[i].body = map.get(`ch_${i}`); changed = true;
          }
          if (typeof chs[i]?.title === "string" && chs[i].title.trim() && map.has(`cht_${i}`) && map.get(`cht_${i}`) !== chs[i].title) {
            chs[i].title = map.get(`cht_${i}`); changed = true;
          }
        }
        ld.chapters = chs;
      }

      if (!changed) return { state, modified: false };
      next.postData = { ...(next.postData || {}), [baseLang]: ld };
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
      try {
        title = await ai.proposeTitle(baseLang, { body: langData.body || "", chapters: langData.chapters || [] });
      } catch (e) {
        const msg = String(e?.message || "");
        if (msg === "no_title") throw new Error(t("editor.ai.errors.noContentForTitle"));
        throw new Error(t("editor.ai.errors.api"));
      }

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
      if (!Array.isArray(langData?.chapters) || langData.chapters.length === 0) return { state, modified: false };

      const targets = [];
      langData.chapters.forEach((ch, i) => {
        const hasBody = !!(ch?.body && ch.body.trim());
        const hasTitle = !!(ch?.title && String(ch.title).trim());
        if (hasBody && !hasTitle) targets.push(i);
      });
      if (targets.length === 0) return { state, modified: false };

      const ai = createAiClient();
      const proposals = new Map();
      try {
        // sequential to keep it simple & predictable
        for (const i of targets) {
          const tt = await ai.proposeChapterTitle(baseLang, { body: langData.chapters[i].body, index: i });
          let final = String(tt || "").replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
          if (final.length > 60) final = final.slice(0, 57).trimEnd() + "…";
          if (!final) continue;
          proposals.set(i, final);
        }
      } catch {
        throw new Error(t("editor.ai.errors.api"));
      }

      if (proposals.size === 0) throw new Error(t("editor.ai.errors.noChaptersToTitle"));

      const next = deepClone(state);
      const chs = (next.postData?.[baseLang]?.chapters || []).map((c) => ({ ...(c || {}) }));
      let changed = false;
      for (const [i, title] of proposals.entries()) {
        if (!chs[i].title || !String(chs[i].title).trim()) {
          chs[i].title = title;
          changed = true;
        }
      }
      if (!changed) return { state, modified: false };

      next.postData = {
        ...(next.postData || {}),
        [baseLang]: { ...(next.postData?.[baseLang] || {}), chapters: chs }
      };
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
      // Order: analyze → clean texts & titles → make post title → make chapter titles
      tasks.push(makeCleanOriginalAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
      tasks.push(makeTitleAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
      tasks.push(makeChapterTitlesAiTask(t, { ...opts, _getMeta: meta, _setMeta: setMeta }));
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
