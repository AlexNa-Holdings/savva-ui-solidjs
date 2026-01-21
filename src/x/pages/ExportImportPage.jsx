// src/x/pages/ExportImportPage.jsx
import { createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import { httpBase } from "../../net/endpoints.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import { toHexBytes32 } from "../../blockchain/utils.js";

export default function ExportImportPage() {
  const app = useApp();
  const { t } = app;

  const [exporting, setExporting] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [importFile, setImportFile] = createSignal(null);
  const [importData, setImportData] = createSignal(null);
  const [showConfirm, setShowConfirm] = createSignal(false);

  async function handleExportPosts() {
    setExporting(true);
    try {
      const res = await fetch(`${httpBase()}my-posts`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || `Export failed: ${res.status}`);
      }

      const data = await res.json();

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `savva-posts-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      pushToast({ type: "success", message: t("exportImport.export.success") });
    } catch (e) {
      pushErrorToast(e, { context: t("exportImport.export.error") });
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportData(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        setImportData(data);
      } catch (err) {
        pushErrorToast(err, { context: t("exportImport.import.invalidJson") });
        setImportFile(null);
      }
    };
    reader.readAsText(file);
  }

  function handleImportClick() {
    if (!importData()) return;
    setShowConfirm(true);
  }

  async function handleConfirmImport() {
    setShowConfirm(false);
    setImporting(true);

    try {
      const data = importData();

      // 1. Upload JSON to IPFS via /store
      const jsonBlob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const formData = new FormData();
      formData.append("file", jsonBlob, "post-list.json");

      const storeRes = await fetch(`${httpBase()}store`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!storeRes.ok) {
        const errorText = await storeRes.text().catch(() => "");
        throw new Error(errorText || `IPFS upload failed: ${storeRes.status}`);
      }

      const storeData = await storeRes.json();
      const ipfsCid = storeData?.cid || storeData?.Hash || storeData;
      if (!ipfsCid || typeof ipfsCid !== "string") {
        throw new Error("Failed to get IPFS CID from response");
      }

      // 2. Generate new GUID
      const guid = crypto.randomUUID();

      // 3. Call ContentRegistry.reg with content_type = "post-list"
      const domain = app.selectedDomainName?.();
      const actorAddr = app.actorAddress?.();

      await sendAsActor(app, {
        contractName: "ContentRegistry",
        functionName: "reg",
        args: [domain, actorAddr, guid, ipfsCid, toHexBytes32("post-list")],
      });

      pushToast({ type: "success", message: t("exportImport.import.success") });

      // Clear the form
      setImportFile(null);
      setImportData(null);
    } catch (e) {
      pushErrorToast(e, { context: t("exportImport.import.error") });
    } finally {
      setImporting(false);
    }
  }

  const actorAddress = () => app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  // Extract post count from various possible data structures
  function getPostCount(data) {
    if (!data) return 0;
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data.posts)) return data.posts.length;
    if (Array.isArray(data.items)) return data.items.length;
    if (Array.isArray(data.data)) return data.data.length;
    if (typeof data === "object") return Object.keys(data).length;
    return 0;
  }

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">
      <ClosePageButton />

      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("exportImport.title")}</h2>
      </div>

      <p class="text-[hsl(var(--muted-foreground))]">
        {t("exportImport.description")}
      </p>

      {/* Export Section */}
      <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <h3 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
          {t("exportImport.export.title")}
        </h3>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("exportImport.export.description")}
        </p>
        <button
          type="button"
          class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExportPosts}
          disabled={exporting()}
        >
          {exporting() ? t("common.working") : t("exportImport.export.button")}
        </button>
      </section>

      {/* Import Section */}
      <section class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
        <h3 class="text-lg font-semibold text-[hsl(var(--card-foreground))]">
          {t("exportImport.import.title")}
        </h3>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {t("exportImport.import.description")}
        </p>

        {/* File Input */}
        <div class="space-y-2">
          <label class="block text-sm font-medium">
            {t("exportImport.import.selectFile")}
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            class="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[hsl(var(--primary))] file:text-[hsl(var(--primary-foreground))] hover:file:opacity-90"
          />
        </div>

        <Show when={importFile()}>
          <div class="text-sm text-[hsl(var(--muted-foreground))]">
            {t("exportImport.import.fileSelected")}: <span class="font-mono">{importFile().name}</span>
          </div>
        </Show>

        <Show when={importData()}>
          <div class="text-sm">
            {t("exportImport.import.postsFound")}: <span class="font-semibold">{getPostCount(importData())}</span>
          </div>
        </Show>

        <button
          type="button"
          class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleImportClick}
          disabled={importing() || !importData()}
        >
          {importing() ? t("common.working") : t("exportImport.import.button")}
        </button>
      </section>

      {/* Confirmation Modal */}
      <Show when={showConfirm()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div class="bg-[hsl(var(--card))] rounded-lg p-6 max-w-lg mx-4 space-y-4 shadow-lg">
            <h3 class="text-lg font-semibold">{t("exportImport.import.confirmTitle")}</h3>

            <div class="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
              <p>
                {t("exportImport.import.confirmActor")}:
                <span class="block font-mono text-xs mt-1 break-all text-[hsl(var(--foreground))]">
                  {actorAddress()}
                </span>
              </p>

              <p class="text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)] p-3 rounded">
                {t("exportImport.import.warningAuthor")}
              </p>

              <p class="text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)] p-3 rounded">
                {t("exportImport.import.warningUrls")}
              </p>
            </div>

            <div class="flex gap-3 justify-end pt-2">
              <button
                type="button"
                class="px-4 py-2 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                onClick={() => setShowConfirm(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={handleConfirmImport}
              >
                {t("exportImport.import.confirmButton")}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </main>
  );
}
