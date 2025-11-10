// src/x/editor/EditorFilesDrawer.jsx
import { Show, createSignal, For, createEffect, on, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { listUploadedFiles, addUploadedFile, addUploadedFileFromUrl, deleteUploadedFile } from "../../editor/storage.js";
import FileGridItem from "./FileGridItem.jsx";
import UploadFromUrlModal from "../modals/UploadFromUrlModal.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import FileContextMenu from "./FileContextMenu.jsx";
import { formatBytes } from "../../utils/format.js";
function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-6 h-6"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

export default function EditorFilesDrawer(props) {
 const { t } = useApp();
  const [files, setFiles] = createSignal([]);
  const [showUrlModal, setShowUrlModal] = createSignal(false);
  const [fileToDelete, setFileToDelete] = createSignal(null);
  const [menuData, setMenuData] = createSignal(null);
  let fileInputRef;
  let drawerContentRef;

   const baseDir = () => props.baseDir;

  const sortedFiles = createMemo(() => {
    return [...files()].sort((a, b) => (b.size || 0) - (a.size || 0));
  });

  const totalSize = createMemo(() => {
    return files().reduce((acc, file) => acc + (file.size || 0), 0);
  });

  const refreshFiles = async () => {
    if (!baseDir()) return;
    const fileList = await listUploadedFiles(baseDir());
    setFiles(fileList);
  };

  createEffect(on(() => props.isOpen, (isOpen) => {
    if (isOpen) refreshFiles();
    else setMenuData(null);
  }));

  createEffect(on(() => props.filesRevision, () => {
    if (props.isOpen) {
      refreshFiles();
    }
  }, { defer: true }));

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.currentTarget.files);
    if (selectedFiles.length === 0) return;
    for (const file of selectedFiles) await addUploadedFile(baseDir(), file);
    await refreshFiles();
    if (fileInputRef) fileInputRef.value = "";
  };

  const handleUrlUpload = async (url) => {
    try {
      const file = await addUploadedFileFromUrl(baseDir(), url);
      pushToast({ type: "success", message: t("editor.files.uploadSuccess", { name: file.name }) });
      await refreshFiles();
    } catch (error) {
      pushErrorToast(error, { context: t("editor.files.uploadError") });
      throw error;
    }
  };

  const handleDelete = (fileName) => setFileToDelete(fileName);
  
  const confirmDelete = async () => {
    try {
      await deleteUploadedFile(baseDir(), fileToDelete());
      await refreshFiles();
    } catch (error) {
      pushErrorToast(error, { context: "File deletion failed" });
    }
  };


  const handleMenuOpen = ({ file, fileType, element }) => {
    const drawerRect = drawerContentRef.getBoundingClientRect();
    const itemRect = element.getBoundingClientRect();
    
    let x = itemRect.left - drawerRect.left;
    let y = element.offsetTop;

    const menuWidth = 192;
    const menuHeight = 150;
    const padding = 16;

    if (x + menuWidth > drawerRect.width - padding) {
      x = drawerRect.width - menuWidth - padding;
    }
    if (y + menuHeight > drawerContentRef.scrollHeight) {
      y = drawerContentRef.scrollHeight - menuHeight - 5;
    }
    
    setMenuData({ file, fileType, x, y });
  };

  const menuItems = createMemo(() => {
    const data = menuData();
    if (!data) return [];
    const { file, fileType } = data;
    const items = [];
    if (fileType === 'image' || fileType === 'video' || fileType === 'audio') {
      items.push({ label: t("editor.files.menu.insert"), onClick: () => props.onInsert(file.name, fileType) });
    }
    // Only show "Set Thumbnail" option for posts, not comments
    const isPost = props.editorMode === 'new_post' || props.editorMode === 'edit_post';
    if (fileType === 'image' && isPost) {
      items.push({ label: t("editor.files.menu.setThumbnail"), onClick: () => props.onSetThumbnail(file.name) });
    }
    items.push({ label: t("editor.files.menu.insertUrl"), onClick: () => props.onInsertUrl(file.name) });
    items.push({ label: t("editor.files.menu.delete"), onClick: () => handleDelete(file.name) });
    return items;
  });

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-80 h-full bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] shadow-lg z-50 transition-transform duration-300 ${props.isOpen ? "translate-x-0" : "translate-x-full"}`}
        style="border-left: 1px solid hsl(var(--border));"
      >
        <div class="h-full flex flex-col">
          <header class="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
            <h3 class="font-semibold">{t("editor.sidebar.files")}</h3>
            <button onClick={props.onClose} class="p-1 rounded-full hover:bg-[hsl(var(--accent))]"><CloseIcon /></button>
          </header>

          <div class="p-4 border-b border-[hsl(var(--border))] space-y-2">
            <input type="file" ref={fileInputRef} multiple onChange={handleFileSelect} class="hidden" />
            <button onClick={() => fileInputRef.click()} class="w-full text-sm px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              {t("editor.files.uploadFromDisk")}
            </button>
            <button onClick={() => setShowUrlModal(true)} class="w-full text-sm px-3 py-2 rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]">
              {t("editor.files.uploadFromUrl")}
            </button>
          </div>

          <div ref={drawerContentRef} class="flex-1 p-4 overflow-y-auto relative">
            <Show when={sortedFiles().length > 0} fallback={
              <div class="h-full flex items-center justify-center text-center text-xs text-[hsl(var(--muted-foreground))]">
                {t("editor.files.empty")}
              </div>
            }>
              <div class="grid grid-cols-3 gap-2">
                <For each={sortedFiles()}>
                  {(file) => <FileGridItem 
                    file={file}
                    onMenuOpen={handleMenuOpen}
                  />}
                </For>
              </div>
            </Show>
            <Show when={menuData()}>
              <FileContextMenu 
                x={menuData().x} 
                y={menuData().y} 
                items={menuItems()} 
                onClose={() => setMenuData(null)} 
              />
            </Show>
          </div>

          <footer class="p-4 border-t border-[hsl(var(--border))] text-xs text-center text-[hsl(var(--muted-foreground))]">
            Total Size: <strong>{formatBytes(totalSize())}</strong>
          </footer>
        </div>
      </div>
      <Show when={props.isOpen}><div class="fixed inset-0 z-40 bg-black/20" onClick={props.onClose} /></Show>
      <UploadFromUrlModal isOpen={showUrlModal()} onClose={() => setShowUrlModal(false)} onUpload={handleUrlUpload} />
      <ConfirmModal
        isOpen={!!fileToDelete()}
        onClose={() => setFileToDelete(null)}
        onConfirm={confirmDelete}
        title={t("editor.files.confirmDeleteTitle")}
        message={t("editor.files.confirmDeleteMessage", { name: fileToDelete() })}
      />
    </>
  );
}