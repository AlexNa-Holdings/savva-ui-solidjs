// src/x/pages/admin/domain_config/CommanderActionBar.jsx
import { createSignal } from "solid-js";
import { useApp } from "../../../../context/AppContext.jsx";

export default function CommanderActionBar(props) {
  const app = useApp();
  const { t } = app;
  let fileInputEl;
  const [busyUpload, setBusyUpload] = createSignal(false);

  const triggerPick = () => fileInputEl?.click();
  const onFilesPicked = async (e) => {
    const files = Array.from(e.currentTarget.files || []);
    if (!files.length) return;
    setBusyUpload(true);
    try {
      await props.onUpload?.(files);
    } finally {
      setBusyUpload(false);
      e.currentTarget.value = "";
    }
  };

  return (
    <div class="grid grid-cols-6 gap-2">
      <button
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full disabled:opacity-60"
        onClick={props.onDownload}
        disabled={props.isDownloading}
      >
        {props.isDownloading ? t("admin.domainConfig.download.downloading") : t("admin.domainConfig.actions.download")}
      </button>

      <button
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full"
        onClick={props.onOpenCreate}
      >
        {t("admin.domainConfig.actions.create")}
      </button>

      <button
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] w-full disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[hsl(var(--accent))]"
        onClick={props.onSave}
        disabled={!props.canSave}
      >
        {t("admin.domainConfig.actions.save")}
      </button>

      <button
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full disabled:opacity-60"
        onClick={triggerPick}
        disabled={busyUpload()}
      >
        {busyUpload() ? t("common.uploading") : t("admin.domainConfig.actions.upload")}
      </button>

      <button
        type="button"
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full disabled:opacity-60 disabled:cursor-not-allowed"
        onClick={props.onDelete}
        onKeyDown={(e) => {
          if (e.key === "Delete") { e.preventDefault(); e.stopPropagation(); }
        }}
        onKeyUp={(e) => {
          if (e.key === "Delete") { e.preventDefault(); e.stopPropagation(); }
        }}
        disabled={!props.canDelete}
      >
        {t("admin.domainConfig.actions.delete")}
      </button>

      <button
        class="px-3 py-2 rounded-md border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] w-full disabled:opacity-60 disabled:cursor-not-allowed"
        onClick={props.onPublish}
        disabled={props.isPublishing}
      >
        {props.isPublishing ? t("common.working") : t("admin.domainConfig.actions.publish")}
      </button>

      {/* hidden picker – onChange (not onInput) */}
      <input
        ref={(el) => (fileInputEl = el)}
        type="file"
        multiple
        onChange={onFilesPicked}
        style="display:none"
      />
    </div>
  );
}
