// src/pages/EditorPage.jsx
import { createMemo, createSignal, Show, onMount, createEffect, on, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import { useHashRouter } from "../routing/hashRouter.js";
import MarkdownInput from "../components/editor/MarkdownInput.jsx";
import LangSelector from "../components/ui/LangSelector.jsx";
import EditorToolbar from "../components/editor/EditorToolbar.jsx";
import EditorFilesDrawer from "../components/editor/EditorFilesDrawer.jsx";
import { rehypeResolveDraftUrls } from "../components/docs/rehype-resolve-draft-urls.js";
import EditorFilesButton from "../components/editor/EditorFilesButton.jsx";
import { loadNewPostDraft, saveNewPostDraft, resolveDraftFileUrl } from "../editor/storage.js";
import { dbg } from "../utils/debug.js";
import EditorChapterSelector from "../components/editor/EditorChapterSelector.jsx";
import EditorTocButton from "../components/editor/EditorTocButton.jsx";
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import { insertTextAtCursor } from "../components/editor/text-utils.js";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";

export default function EditorPage() {
  const { t, domainAssetsConfig } = useApp();
  const { route } = useHashRouter();
  let textareaRef;

  const [postData, setPostData] = createSignal(null);
  const [postParams, setPostParams] = createSignal({});
  const [activeLang, setActiveLang] = createSignal("en");
  const [showPreview, setShowPreview] = createSignal(false);
  const [showFiles, setShowFiles] = createSignal(false);
  const [showChapters, setShowChapters] = createSignal(false);
  const [editingChapterIndex, setEditingChapterIndex] = createSignal(-1);
  const [showConfirmDelete, setShowConfirmDelete] = createSignal(false);
  const [thumbnailUrl, setThumbnailUrl] = createSignal(null);

  let autoSaveTimeoutId;
  onCleanup(() => clearTimeout(autoSaveTimeoutId));

  const editorMode = createMemo(() => {
    const path = route();
    if (path.startsWith("/editor/new")) return "new_post";
    if (path.startsWith("/editor/edit/")) return "edit_post";
    if (path.startsWith("/editor/comment/")) return "comment";
    return "unknown";
  });

  onMount(async () => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFiles(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));

    try {
      if (editorMode() === "new_post") {
        const draft = await loadNewPostDraft();
        const initialData = draft?.content || { en: { title: "", body: "", chapters: [] } };
        const initialParams = draft?.params || {};
        setPostData(initialData);
        setPostParams(initialParams);

        if ((initialData[activeLang()]?.chapters || []).length > 0) {
          setShowChapters(true);
        }
      } else {
        setPostData({ en: { title: "", body: "", chapters: [] } });
        setPostParams({});
      }
    } catch (error) {
      dbg.error("EditorPage", "Failed to load draft, starting fresh.", error);
      setPostData({ en: { title: "", body: "", chapters: [] } });
      setPostParams({});
    }
  });

  createEffect(on([postData, postParams], ([data, params]) => {
    if (data === null || editorMode() !== "new_post") return;
    clearTimeout(autoSaveTimeoutId);
    autoSaveTimeoutId = setTimeout(() => {
      saveNewPostDraft({ content: data, params: params });
    }, 500);
  }, { defer: true }));

  createEffect(async () => {
    const thumbPath = postParams()?.thumbnail;
    if (thumbPath) {
      const url = await resolveDraftFileUrl(thumbPath);
      setThumbnailUrl(url);
    } else {
      setThumbnailUrl(null);
    }
  });

  createEffect(on(activeLang, (lang) => {
    if (!postData()) return;
    const chapters = postData()[lang]?.chapters || [];
    setShowChapters(chapters.length > 0);
    setEditingChapterIndex(-1);
  }));

  const domainLangCodes = () => {
    const fromDomain = (domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    return fromDomain.length > 0 ? fromDomain : ["en"];
  };

  const currentLangData = createMemo(() => postData()?.[activeLang()] || { title: "", body: "", chapters: [] });

  const updateField = (field, value) => {
    setPostData(prev => ({
      ...prev,
      [activeLang()]: {
        ...(prev?.[activeLang()] || { chapters: [] }),
        [field]: value
      }
    }));
  };

  const updateChapterTitle = (index, newTitle) => {
    setPostParams(prev => {
      const lang = activeLang();
      const newLocales = { ...(prev.locales || {}) };
      const newChapters = [...(newLocales[lang]?.chapters || [])];
      newChapters[index] = { ...newChapters[index], title: newTitle };
      newLocales[lang] = { ...newLocales[lang], chapters: newChapters };
      return { ...prev, locales: newLocales };
    });
  };

  const handleAddChapter = () => {
    const newChapterContent = { body: "" };
    const newChapterParams = { title: "" };
    
    setPostData(prev => {
      const lang = activeLang();
      const chapters = [...(prev[lang]?.chapters || []), newChapterContent];
      return { ...prev, [lang]: { ...prev[lang], chapters } };
    });

    setPostParams(prev => {
      const lang = activeLang();
      const newLocales = { ...(prev.locales || {}) };
      const newChapters = [...(newLocales[lang]?.chapters || []), newChapterParams];
      newLocales[lang] = { ...newLocales[lang], chapters: newChapters };
      return { ...prev, locales: newLocales };
    });

    setEditingChapterIndex(currentLangData().chapters.length);
  };

  const handleRemoveChapter = () => {
    if (editingChapterIndex() === -1) return;
    setShowConfirmDelete(true);
  };
  
  const confirmRemoveChapter = () => {
    const indexToRemove = editingChapterIndex();
    
    setPostData(prev => {
      const lang = activeLang();
      const chapters = (prev[lang]?.chapters || []).filter((_, i) => i !== indexToRemove);
      return { ...prev, [lang]: { ...prev[lang], chapters } };
    });

    setPostParams(prev => {
      const lang = activeLang();
      const newLocales = { ...(prev.locales || {}) };
      const chapters = (newLocales[lang]?.chapters || []).filter((_, i) => i !== indexToRemove);
      newLocales[lang] = { ...newLocales[lang], chapters };
      return { ...prev, locales: newLocales };
    });

    setEditingChapterIndex(indexToRemove - 1);
    if (currentLangData().chapters.length - 1 === 0) {
      setShowChapters(false);
    }
  };

  const currentEditorContent = createMemo(() => {
    const langData = currentLangData();
    const index = editingChapterIndex();
    if (index === -1) return langData.body;
    return langData.chapters?.[index]?.body || "";
  });
  
  const handleEditorInput = (value) => {
    const index = editingChapterIndex();
    if (index === -1) {
      updateField('body', value);
    } else {
        const lang = activeLang();
        const chapters = [...(postData()[lang]?.chapters || [])];
        chapters[index] = { ...chapters[index], body: value };
        updateField('chapters', chapters);
    }
  };

  const handleInsertFile = (fileName, fileType) => {
    const url = `uploads/${fileName}`;
    let markdown;
    if (fileType === 'image') {
      markdown = `![${fileName}](${url})`;
    } else {
      markdown = `[${fileName}](${url})`;
    }
    insertTextAtCursor(textareaRef, markdown, handleEditorInput);
  };

  const handleSetThumbnail = (fileName) => {
    const relativePath = `uploads/${fileName}`;
    setPostParams(prev => ({ ...prev, thumbnail: relativePath }));
  };

  const handleInsertUrl = (fileName) => {
    insertTextAtCursor(textareaRef, `uploads/${fileName}`, handleEditorInput);
  };

  const title = createMemo(() => {
    switch (editorMode()) {
      case "new_post": return t("editor.titleNewPost");
      case "edit_post": return t("editor.titleEditPost");
      case "comment": return t("editor.titleComment");
      default: return t("editor.title");
    }
  });

  const markdownPlugins = createMemo(() => {
    dbg.log("EditorPage", "Creating markdown plugins for preview.");
    return [rehypeResolveDraftUrls];
  });

  const combinedChapters = createMemo(() => {
    const contentChapters = currentLangData().chapters || [];
    const paramChapters = postParams()?.locales?.[activeLang()]?.chapters || [];
    return contentChapters.map((c, i) => ({
      ...c,
      title: paramChapters[i]?.title || ""
    }));
  });

  return (
    <main class="p-4 max-w-7xl mx-auto space-y-4">
      <ClosePageButton />

      <header class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <h2 class="text-2xl font-semibold">{title()}</h2>
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            Mode: <strong>{editorMode()}</strong>
          </p>
        </div>
        <div class="w-48 flex-shrink-0 space-y-2">
          <div class="aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden">
            <Show when={thumbnailUrl()}
              fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.thumbnailPlaceholder")}</span>}
            >
              <img src={thumbnailUrl()} alt="Thumbnail preview" class="w-full h-full object-cover" />
            </Show>
          </div>
          <LangSelector
            codes={domainLangCodes()}
            value={activeLang()}
            onChange={setActiveLang}
          />
        </div>
      </header>

      <Show when={postData() !== null} fallback={<div>{t("common.loading")}</div>}>
        <div>
          <div class="flex items-center gap-4 mb-4">
            <input
              type="text"
              value={currentLangData().title}
              onInput={(e) => updateField('title', e.currentTarget.value)}
              placeholder={t("editor.titlePlaceholder")}
              class="flex-1 w-full text-2xl font-bold px-2 py-1 bg-transparent border-b border-[hsl(var(--border))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
            <div class="flex-shrink-0 flex items-center gap-2">
              <Show when={!showChapters()}>
                <EditorTocButton onClick={() => { handleAddChapter(); setShowChapters(true); }} />
              </Show>
              <Show when={!showFiles()}>
                <EditorFilesButton onClick={() => setShowFiles(true)} />
              </Show>
            </div>
          </div>
          
          <Show when={showChapters()}>
            <div class="mb-4">
                <EditorChapterSelector
                    chapters={combinedChapters()}
                    activeIndex={editingChapterIndex()}
                    onSelectIndex={setEditingChapterIndex}
                    onAdd={handleAddChapter}
                    onRemove={handleRemoveChapter}
                    onTitleChange={(newTitle) => updateChapterTitle(editingChapterIndex(), newTitle)}
                />
            </div>
          </Show>
          
          <EditorToolbar
            isPreview={showPreview()}
            onTogglePreview={() => setShowPreview(!showPreview())}
            getTextareaRef={() => textareaRef}
            onValueChange={handleEditorInput}
          />
          <MarkdownInput
            editorRef={(el) => (textareaRef = el)}
            value={currentEditorContent()}
            onInput={handleEditorInput}
            placeholder={t("editor.bodyPlaceholder")}
            showPreview={showPreview()}
            rehypePlugins={markdownPlugins()} 
          />
        </div>
      </Show>

      <EditorFilesDrawer 
        isOpen={showFiles()}
        onClose={() => setShowFiles(false)}
        onInsert={handleInsertFile}
        onSetThumbnail={handleSetThumbnail}
        onInsertUrl={handleInsertUrl}
      />
      <ConfirmModal
        isOpen={showConfirmDelete()}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={confirmRemoveChapter}
        title={t("editor.chapters.confirmDeleteTitle")}
        message={t("editor.chapters.confirmDeleteMessage")}
      />
    </main>
  );
}