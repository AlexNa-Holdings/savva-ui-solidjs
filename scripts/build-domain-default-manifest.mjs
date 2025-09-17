// src/x/pages/admin/DomainConfigPage.jsx
import { createSignal, createMemo, createEffect, createResource } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import FileBrowser from "./domain_config/FileBrowser.jsx";
import FileViewer from "./domain_config/FileViewer.jsx";
import DownloadConfigModal from "./domain_config/DownloadConfigModal.jsx";
import { resetDir, getDirHandle, writeFile, listFiles } from "./domain_config/fs.js";
import { pushToast, pushErrorToast } from "../../../ui/toast.js";
import { dbg } from "../../../utils/debug.js";

/* — helpers from previous version — */
function ensureSlash(s) { const v = String(s || ""); return v && !v.endsWith("/") ? v + "/" : v; }
function parseHtmlListing(html = "") {
  const hrefs = [...html.matchAll(/href\s*=\s*"(.*?)"/gi)].map((m) => m[1]).filter(Boolean);
  const cleaned = hrefs.map((h) => decodeURIComponent(h))
    .filter((h) => !h.startsWith("?") && !h.startsWith("#") && h !== "../" && h !== "/")
    .filter((h) => !/^https?:\/\//i.test(h)).map((h) => (h.startsWith("./") ? h.slice(2) : h));
  const files = [], dirs = [];
  for (const h of cleaned) (h.endsWith("/") ? dirs : files).push(h.replace(/\/+$/, ""));
  return { files, dirs };
}
async function discoverEntriesOrThrow(prefixUrl, subPath = "", depth = 0, maxDepth = 8, cap = { count: 0, max: 10000 }) {
  const url = ensureSlash(prefixUrl) + subPath;
  if (depth > maxDepth) return [];
  const mf = ["__files.json", "files.json", "_files.json"];
  for (const name of mf) {
    try {
      const r = await fetch(ensureSlash(url) + name, { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        let items = Array.isArray(json) ? json : json?.files || [];
        items = items.map((x) => (typeof x === "string" ? x : x?.path)).filter(Boolean)
          .map((p) => (subPath ? `${subPath}${p}` : p));
        dbg.log("DomainConfigPage", "manifest found", { url: ensureSlash(url) + name, items: items.length });
        return items;
      }
    } catch (_) {}
  }
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = await r.text();
        const { files, dirs } = parseHtmlListing(html);
        const out = [];
        for (const f of files) { if (cap.count >= cap.max) break; out.push(subPath ? `${subPath}${f}` : f); cap.count++; }
        for (const d of dirs) { if (cap.count >= cap.max) break;
          const child = await discoverEntriesOrThrow(prefixUrl, `${subPath}${d}/`, depth + 1, maxDepth, cap);
          out.push(...child);
        }
        dbg.log("DomainConfigPage", "html listing", { url, files: files.length, dirs: dirs.length, total: out.length });
        return out;
      }
      if (ct.includes("application/json")) {
        const json = await r.json().catch(() => null);
        let items = [];
        if (Array.isArray(json)) items = json;
        else if (Array.isArray(json?.Entries)) items = json.Entries.map((e) => e?.Name).filter(Boolean);
        else if (Array.isArray(json?.files)) items = json.files;
        items = items.map((n) => (subPath ? `${subPath}${n}` : n));
        if (items.length) return items;
      }
    }
  } catch (_) {}
  if (depth === 0) { const err = new Error(`No manifest or directory listing available at ${url}`); err.code = "NO_LISTING"; throw err; }
  return [];
}
/** download everything from prod/test/local into OPFS */
async function downloadAllDomainFiles(app, sourceType) {
  const info = app.info?.() || {};
  const domain = app.selectedDomainName?.() || "";
  let base = "", prefix = "", targetDirName = "";
  if (sourceType === "prod")      { base = ensureSlash(info.assets_url);      prefix = `${domain}/`; targetDirName = `domain_config_edit/${domain}`; }
  else if (sourceType === "test") { base = ensureSlash(info.temp_assets_url); prefix = `${domain}/`; targetDirName = `domain_config_edit/${domain}`; }
  else                            { base = ensureSlash("/domain_default");    prefix = "";           targetDirName = "domain_config_edit/default"; }
  const sourceUrlPrefix = ensureSlash(base) + prefix;
  dbg.log("DomainConfigPage", "download start", { sourceType, base, prefix, sourceUrlPrefix, targetDirName });
  await resetDir(targetDirName);
  const targetDirHandle = await getDirHandle(targetDirName, { create: true });
  const scanToastId = pushToast({ type: "info", message: app.t("admin.domainConfig.download.scanning"), autohideMs: 0 });
  let fileList = [];
  try { fileList = await discoverEntriesOrThrow(sourceUrlPrefix); } finally { app.dismissToast(scanToastId); }
  fileList = [...new Set(fileList.map((p) => p.replace(/^\/+/, "")))];
  if (!fileList.length) { const err = new Error(app.t("admin.domainConfig.download.noFiles")); err.code = "EMPTY_LIST"; throw err; }
  pushToast({ type: "info", message: app.t("admin.domainConfig.download.found", { n: fileList.length }), autohideMs: 2000 });
  let ok = 0, skipped = 0;
  for (const rel of fileList) {
    try {
      const res = await fetch(sourceUrlPrefix + rel, { cache: "no-store" });
      if (!res.ok) { skipped++; continue; }
      const blob = await res.blob();
      await writeFile(targetDirHandle, rel, blob);
      ok++;
    } catch { skipped++; }
  }
  pushToast({ type: ok ? "success" : "warning", message: app.t("admin.domainConfig.download.result", { ok, total: fileList.length, skipped }), autohideMs: 6000 });
  return { targetDirName, ok, total: fileList.length, skipped };
}

export default function DomainConfigPage() {
  const app = useApp();
  const { t } = app;
  const domainName = () => app.selectedDomainName?.() || "";

  const [currentConfigDir, setCurrentConfigDir] = createSignal(`domain_config_edit/${domainName()}`);
  const [currentPath, setCurrentPath] = createSignal("/");
  const [selectedFile, setSelectedFile] = createSignal(null);
  const [showDownloadModal, setShowDownloadModal] = createSignal(false);
  const [isDownloading, setIsDownloading] = createSignal(false);
  const [refreshKey, setRefreshKey] = createSignal(0);

  // hidden input for folder upload
  let uploadInput;

  const fullPath = createMemo(() => (currentPath() === "/" ? currentConfigDir() : `${currentConfigDir()}${currentPath()}`));

  const [filesResource, { refetch }] = createResource(
    () => [fullPath(), refreshKey()],
    async ([path]) => {
      const items = await listFiles(path);
      dbg.log("DomainConfigPage", "listFiles", path, items?.length ?? 0);
      return items;
    }
  );

  const displayedFiles = createMemo(() => {
    const files = filesResource() || [];
    return currentPath() !== "/" ? [{ name: "..", type: "dir" }, ...files] : files;
  });

  const handleSelectFile = (file) => {
    if (!file) return;
    if (file.type === "dir") {
      if (file.name === "..") {
        const parts = currentPath().split("/").filter(Boolean); parts.pop();
        setCurrentPath(parts.length ? `/${parts.join("/")}` : "/");
      } else {
        setCurrentPath(currentPath() === "/" ? `/${file.name}` : `${currentPath()}/${file.name}`);
      }
      setSelectedFile(null);
    } else {
      setSelectedFile(file);
    }
  };

  createEffect(() => {
    if (filesResource.loading) return;
    const files = displayedFiles();
    if (!files?.length) { setSelectedFile(null); return; }
    if (selectedFile() && files.find((f) => f.name === selectedFile().name)) return;
    setSelectedFile(files.find((f) => f.type === "file") || null);
  });

  // Actions
  const onDeleteAll = async () => {
    if (!confirm(t("admin.domainConfig.delete.confirm"))) return;
    try {
      await resetDir(currentConfigDir());
      setCurrentPath("/");
      setSelectedFile(null);
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.delete.ok") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.delete.err") });
    }
  };

  const onUploadClick = () => uploadInput?.click();

  const onUploadSelected = async (ev) => {
    try {
      const files = Array.from(ev?.currentTarget?.files || []);
      if (!files.length) return;
      const baseHandle = await getDirHandle(currentConfigDir(), { create: true });
      let ok = 0, skipped = 0;
      for (const f of files) {
        // webkitRelativePath gives "sub/dir/file.ext" relative to picked folder
        const rel = (f.webkitRelativePath || f.name).replace(/^\/+/, "");
        try { await writeFile(baseHandle, rel, f); ok++; } catch { skipped++; }
      }
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.upload.result", { ok, skipped }) });
      ev.currentTarget.value = "";
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.upload.err") });
    }
  };

  const onSave = () => {
    pushToast({ type: "info", message: t("common.comingSoon") });
  };

  const onPublish = () => {
    pushToast({ type: "info", message: t("common.comingSoon") });
  };

  const handleDownloadSelect = async (sourceType) => {
    setShowDownloadModal(false);
    setIsDownloading(true);
    const toastId = pushToast({ type: "info", message: t("admin.domainConfig.download.downloading"), autohideMs: 0 });
    try {
      const { targetDirName } = await downloadAllDomainFiles(app, sourceType);
      setCurrentConfigDir(targetDirName);
      setCurrentPath("/");
      setSelectedFile(null);
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.download.success") });
    } catch (e) {
      const details =
        e?.code === "NO_LISTING"
          ? t("admin.domainConfig.download.noListingHint")
          : e?.message || String(e || "");
      pushErrorToast(new Error(details), { context: t("admin.domainConfig.download.error") });
    } finally {
      setIsDownloading(false);
      app.dismissToast(toastId);
    }
  };

  return (
    <div class="p-4 h-[calc(100vh-12rem)] flex flex-col">
      <h3 class="text-xl font-semibold mb-2">{t("admin.domainConfig.title", { domain: domainName() })}</h3>

      <div class="flex-grow grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-4 border border-[hsl(var(--border))] rounded-lg p-2 overflow-hidden">
        <FileBrowser
          files={displayedFiles()}
          currentPath={currentPath()}
          selectedFile={selectedFile()}
          onSelectFile={handleSelectFile}
          loading={filesResource.loading}
          emptyText={t("admin.domainConfig.browser.empty")}
        />
        <div class="overflow-auto h-full">
          <FileViewer file={selectedFile()} basePath={fullPath()} />
        </div>
      </div>

      {/* Norton-style action bar */}
      <div class="pt-3 mt-3">
        <div class="grid grid-cols-5 gap-2">
          <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
            onClick={onDeleteAll}>
            {t("admin.domainConfig.actions.delete")}
          </button>

          <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
            onClick={onUploadClick}>
            {t("admin.domainConfig.actions.upload")}
          </button>

          <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
            onClick={onSave}>
            {t("admin.domainConfig.actions.save")}
          </button>

          <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
            onClick={onPublish}>
            {t("admin.domainConfig.actions.publish")}
          </button>

          <button class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
            onClick={() => setShowDownloadModal(true)}
            disabled={isDownloading()}>
            {isDownloading() ? t("admin.domainConfig.download.downloading") : t("admin.domainConfig.actions.download")}
          </button>
        </div>

        {/* hidden folder input for Upload */}
        <input
          ref={uploadInput}
          type="file"
          webkitdirectory
          multiple
          onInput={onUploadSelected}
          style="display:none"
        />
      </div>

      <DownloadConfigModal
        isOpen={showDownloadModal()}
        onClose={() => setShowDownloadModal(false)}
        onSelect={handleDownloadSelect}
      />
    </div>
  );
}
