// scripts/i18n-docs.mjs
//
// Localize developer documentation from English to the other locales.
//
// Behavior:
//  - English (source of truth): public/dev_docs/en
//  - Locales are discovered from src/i18n/*.js (excluding useI18n.js, just like scripts/i18n.mjs)
//  - For each non-EN locale:
//      * Ensure public/dev_docs/<lang> exists
//      * Delete files not present in EN
//      * Re-translate ONLY files whose EN source changed (tracked via per-locale .i18n-docs-state.json SHA256 map)
//      * Markdown translated with code/HTML preserved
//      * sidebar.yaml translated only for label/title fields
//
// Usage:
//   node scripts/i18n-docs.mjs
//
// Env:
//   OPENAI_API_KEY  (required)
//   OPENAI_MODEL    (optional, default: gpt-4o-mini)
//   DRY_RUN=1       (optional)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import yaml from "js-yaml";
import OpenAI from "openai";

dotenv.config();

const ROOT = process.cwd();

// --- match scripts/i18n.mjs constants exactly ---
const SRC_DIR = path.join(ROOT, "src");
const I18N_DIR = path.join(SRC_DIR, "i18n"); // ← same as i18n.mjs 
function isLangFile(name) {
  // same filter as i18n.mjs
  return name.endsWith(".js") && !/useI18n\.js$/i.test(name); // 
}

const DEV_DOCS_DIR = path.join(ROOT, "public", "dev_docs");
const EN_DIR = path.join(DEV_DOCS_DIR, "en");
const STATE_FILE = ".i18n-docs-state.json";
const DRY_RUN = process.env.DRY_RUN === "1";

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!OPENAI_KEY) {
  console.error("[i18n-docs] Missing OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function walkFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === STATE_FILE) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(p);
    }
  })(dir);
  return out;
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function readFileSafe(p) { try { return fs.readFileSync(p); } catch { return null; } }
function writeFileSafe(p, content) {
  if (DRY_RUN) { console.log(`[DRY] write ${p}`); return; }
  ensureDir(path.dirname(p)); fs.writeFileSync(p, content);
}
function removeFileSafe(p) { if (DRY_RUN) console.log(`[DRY] remove ${p}`); else try { fs.unlinkSync(p); } catch {} }
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; } }
function saveJson(p, obj) { if (DRY_RUN) console.log(`[DRY] state -> ${p}`); else { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8"); } }

function englishMap() {
  const files = walkFiles(EN_DIR);
  const m = new Map();
  for (const abs of files) m.set(path.relative(EN_DIR, abs), abs);
  return m;
}

function listLocaleFiles(localeDir) {
  if (!fs.existsSync(localeDir)) return [];
  return walkFiles(localeDir).map(p => path.relative(localeDir, p));
}

function isMarkdown(rel) { return /\.md$/i.test(rel); }
function isYaml(rel) { return /\.ya?ml$/i.test(rel); }
function isSidebarYaml(rel) {
  return /(^|[\\/])sidebar\.ya?ml$/i.test(rel);
}

// --- DISCOVER LOCALES (exact approach as scripts/i18n.mjs) ---
function discoverLocalesFromI18n() {
  if (!fs.existsSync(I18N_DIR)) {
    console.error(`[i18n-docs] Not found: ${path.relative(ROOT, I18N_DIR)}`); // mirrors i18n.mjs sanity
    process.exit(1);
  }
  const langFiles = fs.readdirSync(I18N_DIR).filter(isLangFile); // same filter
  if (langFiles.length === 0) {
    console.error("[i18n-docs] No language files found in src/i18n");
    process.exit(1);
  }
  // Derive codes from filenames (e.g., "ru.js" -> "ru"), skip en.js
  const codes = langFiles
    .map(f => path.basename(f, ".js"))
    .filter(code => code !== "en");
  // Ensure doc folders exist
  for (const code of codes) {
    const dir = path.join(DEV_DOCS_DIR, code);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  return codes;
}

// scripts/i18n-docs.mjs — helpers to unwrap accidental code fences
function unwrapCodeFence(text) {
  if (!text) return text;
  const s = String(text).trim();

  // ```[lang]\n...content...\n```
  const fenceRe = /^```[a-z0-9_-]*\s*\n([\s\S]*?)\n```$/i;
  const m = s.match(fenceRe);
  if (m) return m[1].trim();

  // ```...``` (single-line fallback)
  const fenceSingle = /^```([\s\S]*?)```$/;
  const m2 = s.match(fenceSingle);
  if (m2) return m2[1].trim();

  return s;
}

// scripts/i18n-docs.mjs — replace translateMarkdownTo with this version
async function translateMarkdownTo(langCode, markdown) {
  const sys =
    "You are a professional technical translator. Translate user-visible prose while preserving Markdown structure, " +
    "code fences, inline code, raw HTML, YAML frontmatter, and URLs. Do NOT translate code. " +
    "Do NOT wrap the output in triple backticks or any code fences.";
  const user =
    `Target language: ${langCode}\n` +
    "Return ONLY the translated Markdown text (no surrounding code fences).\n\n" +
    // important: we no longer wrap the input inside ```...```
    "Input Markdown follows below:\n\n" +
    markdown;

  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });

  const raw = (res.choices?.[0]?.message?.content || "").trim();
  return unwrapCodeFence(raw);
}


async function translateSidebarYamlTo(langCode, text) {
  let doc; try { doc = yaml.load(text) ?? {}; } catch { return text; }
  const strings = [];
  (function collect(o) {
    if (Array.isArray(o)) o.forEach(collect);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if ((k === "title" || k === "label") && typeof v === "string") strings.push(v);
        else collect(v);
      }
    }
  })(doc);
  if (!strings.length) return text;

  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL, temperature: 0.2, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Translate UI strings. Return JSON { list: [...] } in the same order." },
      { role: "user", content: JSON.stringify({ target_language: langCode, list: strings }) },
    ],
  });
  let translated = [];
  try { translated = JSON.parse(res.choices?.[0]?.message?.content || "{}").list || []; } catch {}
  if (translated.length !== strings.length) return text;

  let idx = 0;
  (function inject(o) {
    if (Array.isArray(o)) o.forEach(inject);
    else if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if ((k === "title" || k === "label") && typeof v === "string") o[k] = translated[idx++];
        else inject(v);
      }
    }
  })(doc);

  // scripts/i18n-docs.mjs — at the end of translateSidebarYamlTo
const outYaml = yaml.dump(doc, { lineWidth: 1000, quotingType: '"' });
// guard: never fenced
return unwrapCodeFence(outYaml);
}

// --- MAIN ---
async function main() {
  const locales = discoverLocalesFromI18n();
  console.log(`[i18n-docs] Locales: ${locales.join(", ") || "(none)"}`);

  const enFiles = englishMap(); // Map<rel, abs>

  for (const lang of locales) {
    const targetDir = path.join(DEV_DOCS_DIR, lang);
    const statePath = path.join(targetDir, STATE_FILE);
    const state = loadJson(statePath); // { "<rel>": "<sha256(en)>" }

    // 1) Remove stray files
    for (const rel of listLocaleFiles(targetDir)) {
      if (!enFiles.has(rel)) {
        console.log(`[i18n-docs] ${lang} remove stray: ${rel}`);
        removeFileSafe(path.join(targetDir, rel));
        delete state[rel];
      }
    }

    // 2) Translate changed/missing
    let updated = 0;
    for (const [rel, enAbs] of enFiles.entries()) {
      const enBuf = readFileSafe(enAbs); if (!enBuf) continue;
      const enHash = sha256(enBuf);
      const outAbs = path.join(targetDir, rel);
      const prevHash = state[rel] || "";

      const needTranslate = (() => {
        if (!fs.existsSync(outAbs)) return true;
        if (prevHash && prevHash === enHash) return false; // unchanged since last time
        try {
          const enStat = fs.statSync(enAbs);
          const tStat = fs.statSync(outAbs);
          return enStat.mtimeMs > tStat.mtimeMs; // EN newer than target
        } catch { return true; }
      })();
      if (!needTranslate) continue;

      let outText;
      if (isMarkdown(rel)) {
        console.log(`[i18n-docs] ${lang} ← ${rel} (md)`);
        outText = await translateMarkdownTo(lang, enBuf.toString("utf8"));
      } else if (isYaml(rel) && isSidebarYaml(rel)) {
        console.log(`[i18n-docs] ${lang} ← ${rel} (sidebar.yaml)`);
        outText = await translateSidebarYamlTo(lang, enBuf.toString("utf8"));
      } else {
        console.log(`[i18n-docs] ${lang} copy (verbatim): ${rel}`);
        outText = enBuf.toString("utf8");
      }

      writeFileSafe(outAbs, outText);
      state[rel] = enHash;
      updated++;
    }

    saveJson(statePath, state);
    console.log(`[i18n-docs] ${lang} done: ${updated} updated`);
  }

  console.log("[i18n-docs] All locales complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
