// src/x/pages/admin/domain_config/FileViewer.jsx
import { createEffect, createSignal, Show, onCleanup, onMount } from "solid-js";
import { useApp } from "../../../../context/AppContext.jsx";
import { readFileAsBlob, getDirHandle, writeFile } from "./fs.js";
import { dbg } from "../../../../utils/debug.js";

const MAX_TEXT_EDIT = 1024 * 1024;

const isLikelyText = (name = "", mime = "") => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (["json","yaml","yml","md","txt","css","js","ts","tsx","jsx","html","xml","svg"].includes(ext)) return true;
  if (["application/json","application/yaml","application/x-yaml","application/xml","image/svg+xml"].includes(mime)) return true;
  return false;
};
const isImageLike = (name = "", mime = "") =>
  mime.startsWith("image/") || ["png","jpg","jpeg","gif","webp","bmp","avif","svg"].includes((name.split(".").pop()||"").toLowerCase());

export default function FileViewer(props) {
  const app = useApp();
  const { t } = app;

  const [state, setState] = createSignal({
    kind: "empty",
    loading: false,
    text: "",
    original: "",
    url: "",
    error: "",
    canSave: false,
    dirty: false,
  });

  let currentUrl = "";

  function reportEditorState(dirty, canSave) {
    props.onEditorState?.({ dirty, canSave });
  }

  async function saveToOpfs(fullDirPath, filename, content) {
    const dirHandle = await getDirHandle(fullDirPath, { create: true });
    await writeFile(dirHandle, filename, content);
  }

  onMount(() => {
    props.bindApi?.({
      save: async () => {
        const st = state();
        if (st.kind !== "text" || !st.canSave || !props.file?.name) return false;
        await saveToOpfs(props.basePath, props.file.name, st.text);
        setState((s) => ({ ...s, original: s.text, dirty: false }));
        reportEditorState(false, true);
        return true;
      },
    });
  });

  createEffect(() => {
    const file = props.file;
    const base = props.basePath;

    setState((s) => ({ ...s, kind: "empty", loading: true, text: "", original: "", url: "", error: "", dirty: false, canSave: false }));
    reportEditorState(false, false);

    if (!file || file.type !== "file" || !file.name) {
      setState((s) => ({ ...s, loading: false, kind: "empty" }));
      reportEditorState(false, false);
      return;
    }

    const fullPath = `${base}/${file.name}`.replace(/\/+/g, "/");
    dbg.log("FileViewer", "read from OPFS", fullPath);

    (async () => {
      try {
        const blob = await readFileAsBlob(fullPath);
        if (!blob) {
          setState((s) => ({ ...s, loading: false, kind: "error", error: t("admin.domainConfig.viewer.notFound") }));
          reportEditorState(false, false);
          return;
        }

        const mime = blob.type || "";

        if (isImageLike(file.name, mime) && mime !== "text/plain") {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = URL.createObjectURL(blob);
          setState((s) => ({ ...s, loading: false, kind: "image", url: currentUrl, dirty: false, canSave: false }));
          reportEditorState(false, false);
          return;
        }

        if (isLikelyText(file.name, mime)) {
          if (blob.size > MAX_TEXT_EDIT) {
            setState((s) => ({
              ...s,
              loading: false,
              kind: "tooLarge",
              error: t("admin.domainConfig.viewer.tooLarge", { sizeKb: Math.ceil(blob.size / 1024) }),
              dirty: false,
              canSave: false,
            }));
            reportEditorState(false, false);
          } else {
            const text = await blob.text();
            setState((s) => ({ ...s, loading: false, kind: "text", text, original: text, dirty: false, canSave: true }));
            reportEditorState(false, true);
          }
          return;
        }

        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = URL.createObjectURL(blob);
        setState((s) => ({ ...s, loading: false, kind: "binary", url: currentUrl, dirty: false, canSave: false }));
        reportEditorState(false, false);
      } catch (e) {
        setState((s) => ({
          ...s,
          loading: false,
          kind: "error",
          error: t("admin.domainConfig.viewer.error", { msg: e?.message || String(e || "") }),
          dirty: false,
          canSave: false,
        }));
        reportEditorState(false, false);
      }
    })();
  });

  function onEdit(e) {
    const val = e.currentTarget.value;
    const dirty = val !== state().original;
    setState((s) => ({ ...s, text: val, dirty }));
    reportEditorState(dirty, true);
  }

  onCleanup(() => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = "";
  });

  return (
    <div class="border border-[hsl(var(--border))] rounded-md h-full flex flex-col overflow-hidden">
      <div class="px-3 py-2 text-sm border-b border-[hsl(var(--border))]">
        {props.file?.name || t("admin.domainConfig.viewer.title")}
        <Show when={state().dirty && state().canSave}>
          <span class="ml-2 text-xs opacity-70">• {t("admin.domainConfig.editor.unsaved")}</span>
        </Show>
      </div>

      {/* make the pane non-scrolling; inner content will scroll */}
      <div class="flex-1 overflow-hidden p-3 min-h-0">
        <Show when={!state().loading} fallback={<div class="text-sm opacity-70">{t("common.loading")}</div>}>
          <Show when={state().kind === "text"}>
            {/* editor fills the available height and has the ONLY scrollbar */}
            <div class="h-full min-h-0">
              <textarea
                class="w-full h-full resize-none font-mono text-sm leading-5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]"
                value={state().text}
                onInput={onEdit}
                spellcheck={false}
              />
            </div>
          </Show>

          <Show when={state().kind === "image"}>
            <div class="h-full overflow-auto flex items-start justify-center">
              <img src={state().url} alt={props.file?.name} class="max-w-full max-h-full object-contain" />
            </div>
          </Show>

          <Show when={state().kind === "binary"}>
            <div class="text-sm opacity-80">{t("admin.domainConfig.viewer.binary")}</div>
          </Show>

          <Show when={state().kind === "tooLarge"}>
            <div class="text-sm opacity-80">{state().error}</div>
          </Show>

          <Show when={state().kind === "empty"}>
            <div class="text-sm opacity-70">{t("admin.domainConfig.viewer.selectFile")}</div>
          </Show>

          <Show when={state().kind === "error"}>
            <div class="text-sm text-[hsl(var(--destructive))]">{state().error}</div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
