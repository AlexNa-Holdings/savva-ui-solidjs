// src/x/pages/admin/DomainConfigPage.jsx
import { createSignal, createMemo, createEffect, createResource, onMount, onCleanup } from "solid-js";
import { useApp } from "../../../context/AppContext.jsx";
import FileBrowser from "./domain_config/FileBrowser.jsx";
import FileViewer from "./domain_config/FileViewer.jsx";
import DownloadConfigModal from "./domain_config/DownloadConfigModal.jsx";
import CreateEntryModal from "./domain_config/CreateEntryModal.jsx";
import CommanderActionBar from "./domain_config/CommanderActionBar.jsx";
import { resetDir, getDirHandle, writeFile, listFiles, deleteEntry, createDir } from "./domain_config/fs.js";
import { discoverEntriesOrThrow } from "./domain_config/remoteScan.js";
import { pushToast, pushErrorToast } from "../../../ui/toast.js";
import { MaximizeIcon, MinimizeIcon } from "../../ui/icons/ToolbarIcons.jsx";
import { dbg } from "../../../utils/debug.js";
import { uploadFilesToTempAssets } from "./domain_config/publishToTest.js";
import { collectOpfsDomainFiles } from "./domain_config/collectDomainFiles.js";
import { httpBase } from "../../../net/endpoints.js";
import { setDomainAssetsCid } from "../../../blockchain/adminCommands.js";

/* small helpers */
const LS_KEY = (d) => `sv_domain_config_dir:${d}`;
const ensureSlash = (s) => (s && !s.endsWith("/") ? s + "/" : s || "/");

async function downloadAllDomainFiles(app, sourceType) {
  const info = app.info?.() || {};
  const domain = app.selectedDomainName?.() || "";
  let base = "",
    prefix = "",
    targetDirName = "";
  if (sourceType === "prod") {
    base = ensureSlash(info.assets_url);
    prefix = `${domain}/`;
    targetDirName = `domain_config_edit/${domain}`;
  } else if (sourceType === "test") {
    base = ensureSlash(info.temp_assets_url);
    prefix = `${domain}/`;
    targetDirName = `domain_config_edit/${domain}`;
  } else {
    base = ensureSlash("/domain_default");
    prefix = "";
    targetDirName = "domain_config_edit/default";
  }
  const sourceUrlPrefix = ensureSlash(base) + prefix;

  dbg.log("DomainConfigPage", "download start", { sourceType, base, prefix, sourceUrlPrefix, targetDirName });
  await resetDir(targetDirName);
  const targetDirHandle = await getDirHandle(targetDirName, { create: true });

  const scanToastId = pushToast({ type: "info", message: app.t("admin.domainConfig.download.scanning"), autohideMs: 0 });
  let fileList = [];
  try {
    fileList = await discoverEntriesOrThrow(sourceUrlPrefix);
  } finally {
    app.dismissToast(scanToastId);
  }

  fileList = [...new Set(fileList.map((p) => p.replace(/^\/+/, "")))];
  if (!fileList.length) {
    const err = new Error(app.t("admin.domainConfig.download.noFiles"));
    err.code = "EMPTY_LIST";
    throw err;
  }

  pushToast({ type: "info", message: app.t("admin.domainConfig.download.found", { n: fileList.length }), autohideMs: 2000 });

  let ok = 0,
    skipped = 0;
  for (const rel of fileList) {
    try {
      const res = await fetch(sourceUrlPrefix + rel, { cache: "no-store" });
      if (!res.ok) {
        skipped++;
        continue;
      }
      const blob = await res.blob();
      await writeFile(targetDirHandle, rel, blob);
      ok++;
    } catch {
      skipped++;
    }
  }

  pushToast({
    type: ok ? "success" : "warning",
    message: app.t("admin.domainConfig.download.result", { ok, total: fileList.length, skipped }),
    autohideMs: 6000,
  });

  try {
    localStorage.setItem(LS_KEY(domain || "default"), targetDirName);
  } catch { }
  return { targetDirName, ok, total: fileList.length, skipped };
}


export default function DomainConfigPage() {
  const app = useApp();
  const { t } = app;
  const domainName = () => app.selectedDomainName?.() || "";

  const [currentConfigDir, setCurrentConfigDir] = createSignal(`domain_config_edit/${domainName()}`);
  const [currentPath, setCurrentPath] = createSignal("/");
  const [selectedItem, setSelectedItem] = createSignal(null); // file or dir
  const [showDownloadModal, setShowDownloadModal] = createSignal(false);
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [isDownloading, setIsDownloading] = createSignal(false);
  const [refreshKey, setRefreshKey] = createSignal(0);
  const [busyPublishTest, setBusyPublishTest] = createSignal(false);
  const [busyPublishProd, setBusyPublishProd] = createSignal(false);

  const [canSave, setCanSave] = createSignal(false);
  let viewerApi = null;

  /* fullscreen */
  const [maximized, setMaximized] = createSignal(false);
  const containerClass = createMemo(() =>
    maximized()
      ? "fixed inset-0 z-[100] bg-[hsl(var(--background))] p-4 sm:p-6 flex flex-col"
      : "p-4 h-[calc(100vh-12rem)] flex flex-col"
  );
  createEffect(() => {
    if (maximized()) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      onCleanup(() => {
        document.documentElement.style.overflow = prev;
      });
    }
  });
  onMount(() => {
    const isEditableTarget = (el) => {
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      const role = (el.getAttribute?.("role") || "").toLowerCase();
      if (role === "textbox" || role === "combobox" || role === "spinbutton") return true;
      return false;
    };

    const onKey = (e) => {
      const key = (e.key || "").toLowerCase();
      if (key === "escape" && maximized()) setMaximized(false);
      if (key === "m" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setMaximized((v) => !v);
      }
      if (key === "delete") {
        const target = e.target || document.activeElement;
        if (isEditableTarget(target)) return;
        onDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  /* restore working folder */
  onMount(() => {
    const key = LS_KEY(domainName() || "default");
    const saved = (() => {
      try {
        return localStorage.getItem(key) || "";
      } catch {
        return "";
      }
    })();
    if (saved) {
      dbg.log("DomainConfigPage", "restore working dir", saved);
      setCurrentConfigDir(saved);
      setCurrentPath("/");
      setSelectedItem(null);
      setRefreshKey((k) => k + 1);
    }
  });

  /* data */
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
  createEffect(() => {
    if (filesResource.loading) return;
    if (!displayedFiles()?.length) setSelectedItem(null);
  });

  /* helpers */
  const confirmAndMaybeSave = async () => {
    if (!canSave()) return true;
    const yes = confirm(t("admin.domainConfig.editor.confirmSave"));
    if (!yes) return true; // discard
    try {
      const ok = await viewerApi?.save?.();
      if (!ok) return false;
      pushToast({ type: "success", message: t("admin.domainConfig.editor.savedOk") });
      return true;
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.editor.saveErr") });
      return false;
    }
  };
  const relFromCurrent = (name) => {
    const sub = currentPath() === "/" ? "" : currentPath().slice(1);
    return sub ? `${sub}/${name}` : name;
  };

  /* selection & navigation */
  const handleSelectItem = async (file) => {
    if (!file) return;
    const proceed = await confirmAndMaybeSave();
    if (!proceed) return;
    setSelectedItem(file);
  };
  const handleOpenDir = async (file) => {
    if (!file || file.type !== "dir") return;
    const proceed = await confirmAndMaybeSave();
    if (!proceed) return;
    if (file.name === "..") {
      const parts = currentPath().split("/").filter(Boolean);
      parts.pop();
      setCurrentPath(parts.length ? `/${parts.join("/")}` : "/");
    } else {
      setCurrentPath(currentPath() === "/" ? `/${file.name}` : `${currentPath()}/${file.name}`);
    }
    setSelectedItem(null);
  };

  /* actions */
  const onCreate = async ({ name, isFolder }) => {
    try {
      const base = await getDirHandle(currentConfigDir(), { create: true });
      const rel = relFromCurrent(name);
      if (isFolder) {
        await createDir(currentConfigDir(), rel);
      } else {
        await writeFile(base, rel, "");
      }
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.new.createdOk", { name }) });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.new.err") });
    }
  };

  const onDeleteSelected = async () => {
    const sel = selectedItem();
    if (!sel || sel.name === "..") return;
    const proceed = await confirmAndMaybeSave();
    if (!proceed) return;
    const rel = relFromCurrent(sel.name);
    if (!confirm(t("admin.domainConfig.delete.confirmItem", { name: sel.name }))) return;
    try {
      await deleteEntry(currentConfigDir(), rel);
      setSelectedItem(null);
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.delete.ok") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.delete.err") });
    }
  };

  // ✅ upload: simple picker to the open folder (onChange)
  const onUploadFiles = async (files) => {
    const proceed = await confirmAndMaybeSave();
    if (!proceed) return;
    try {
      const baseHandle = await getDirHandle(currentConfigDir(), { create: true });
      const sub = currentPath() === "/" ? "" : currentPath().slice(1);
      let ok = 0,
        skipped = 0;
      for (const f of files) {
        const rel = sub ? `${sub}/${f.name}` : f.name;
        try {
          await writeFile(baseHandle, rel, f);
          ok++;
        } catch {
          skipped++;
        }
      }
      setRefreshKey((k) => k + 1);
      await refetch();
      if (files.length === 1) setSelectedItem({ name: files[0].name, type: "file" });
      pushToast({ type: "success", message: t("admin.domainConfig.upload.result", { ok, skipped }) });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.upload.err") });
    }
  };

  const onSave = async () => {
    try {
      const ok = await viewerApi?.save?.();
      if (ok) pushToast({ type: "success", message: t("admin.domainConfig.editor.savedOk") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domainConfig.editor.saveErr") });
    }
  };

  const onPublish = async () => {
    if (busyPublishTest() || busyPublishProd()) return;
    const ok = window.confirm(app.t("admin.domain.publish.confirm_test"));
    if (!ok) return;
    setBusyPublishTest(true);
    try {
      const domain = domainName();
      const files = await collectOpfsDomainFiles(currentConfigDir());
      await uploadFilesToTempAssets(app, domain, files);
      pushToast({ type: "success", message: t("admin.domain.publish.success_test") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domain.publish.error") });
    } finally {
      setBusyPublishTest(false);
    }
  };

  const onPublishToProduction = async () => {
    if (busyPublishProd() || busyPublishTest()) return;
    const ok = window.confirm(app.t("admin.domain.publish.confirm_prod"));
    if (!ok) return;
    setBusyPublishProd(true);
    try {
      const domain = domainName();
      const base = httpBase();
      const url = `${base}ipfs-assets?domain=${encodeURIComponent(domain)}`;
      const res = await fetch(url, { method: "GET", credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      const json = await res.json().catch(() => ({}));
      const cid = json?.cid;
      if (!cid) throw new Error(t("admin.domain.publish.noCid"));
      await setDomainAssetsCid(app, { domain, cid });
      pushToast({ type: "success", message: t("admin.domain.publish.success_prod") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.domain.publish.error") });
    } finally {
      setBusyPublishProd(false);
    }
  };


  const handleDownloadSelect = async (sourceType) => {
    const proceed = await confirmAndMaybeSave();
    if (!proceed) return;

    setShowDownloadModal(false);
    setIsDownloading(true);
    const toastId = pushToast({ type: "info", message: t("admin.domainConfig.download.downloading"), autohideMs: 0 });
    try {
      const { targetDirName } = await downloadAllDomainFiles(app, sourceType);
      setCurrentConfigDir(targetDirName);
      try {
        localStorage.setItem(LS_KEY(domainName() || "default"), targetDirName);
      } catch { }
      setCurrentPath("/");
      setSelectedItem(null);
      setRefreshKey((k) => k + 1);
      await refetch();
      pushToast({ type: "success", message: t("admin.domainConfig.download.success") });
    } catch (e) {
      const details = e?.code === "NO_LISTING" ? t("admin.domainConfig.download.noListingHint") : e?.message || String(e || "");
      pushErrorToast(new Error(details), { context: t("admin.domainConfig.download.error") });
    } finally {
      setIsDownloading(false);
      app.dismissToast(toastId);
    }
  };

  const activeFileForViewer = createMemo(() => (selectedItem()?.type === "file" ? selectedItem() : null));

  /* render */
  return (
    <div class={containerClass()}>
      <div class="mb-2 flex items-center gap-2">
        <h3 class="text-xl font-semibold">{t("admin.domainConfig.title", { domain: domainName() })}</h3>

        <div class="ml-auto flex items-center gap-2">
          <button
            class="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
            onClick={() => setMaximized((v) => !v)}
            aria-pressed={maximized() ? "true" : "false"}
            title={maximized() ? t("common.restore") : t("common.maximize")}
          >
            {maximized() ? <MinimizeIcon /> : <MaximizeIcon />}
            <span class="sr-only">{maximized() ? t("common.restore") : t("common.maximize")}</span>
          </button>
        </div>
      </div>

      <div class="flex-grow grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-4 border border-[hsl(var(--border))] rounded-lg p-2 overflow-hidden">
        <FileBrowser
          files={displayedFiles()}
          currentPath={currentPath()}
          selectedFile={selectedItem()}
          onSelectFile={handleSelectItem} // single click: select
          onOpenDir={handleOpenDir} // double click: open dir
          loading={filesResource.loading}
          emptyText={t("admin.domainConfig.browser.empty")}
        />
        <div class="overflow-hidden h-full min-h-0">
          <FileViewer
            file={activeFileForViewer()}
            basePath={fullPath()}
            bindApi={(api) => (viewerApi = api)}
            onEditorState={(s) => setCanSave(!!s?.dirty && !!s?.canSave)}
          />
        </div>
      </div>

      {/* Action bar: Download · Create · Save · Upload · Delete · Publish */}
      <div class="pt-3 mt-3">
        <CommanderActionBar
          isDownloading={isDownloading()}
          canSave={canSave()}
          canDelete={!!selectedItem() && selectedItem()?.name !== ".."}
          onDownload={() => setShowDownloadModal(true)}
          onOpenCreate={() => setShowCreateModal(true)}
          onSave={onSave}
          onUpload={onUploadFiles}   // <— fixed: uses onChange under the hood
          onDelete={onDeleteSelected}
          onPublish={onPublish}
          isPublishing={busyPublishTest()}
        />
      </div>

      <div class="mt-4">
        <button
          class="w-full px-3 py-2 rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={onPublishToProduction}
          disabled={busyPublishProd() || busyPublishTest()}
        >
          {busyPublishProd() ? t("common.working") : t("admin.domainConfig.publishProd.button")}
        </button>
      </div>

      <DownloadConfigModal isOpen={showDownloadModal()} onClose={() => setShowDownloadModal(false)} onSelect={handleDownloadSelect} />
      <CreateEntryModal isOpen={showCreateModal()} onClose={() => setShowCreateModal(false)} onCreate={onCreate} />
    </div>
  );
}
