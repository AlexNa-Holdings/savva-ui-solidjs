// src/pages/EditorPage.jsx
import { createMemo, createSignal, Show, onMount, createEffect, on, onCleanup, batch } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import { useHashRouter, navigate } from "../routing/hashRouter.js";
import MarkdownInput from "../components/editor/MarkdownInput.jsx";
import LangSelector from "../components/ui/LangSelector.jsx";
import EditorToolbar from "../components/editor/EditorToolbar.jsx";
import EditorFilesDrawer from "../components/editor/EditorFilesDrawer.jsx";
import { rehypeResolveDraftUrls } from "../docs/rehype-resolve-draft-urls.js";
import EditorFilesButton from "../components/editor/EditorFilesButton.jsx";
import { loadDraft, saveDraft, resolveDraftFileUrl, DRAFT_DIRS } from "../editor/storage.js";
import { dbg } from "../utils/debug.js";
import EditorChapterSelector from "../components/editor/EditorChapterSelector.jsx";
import EditorTocButton from "../components/editor/EditorTocButton.jsx";
import ConfirmModal from "../components/ui/ConfirmModal.jsx";
import { insertTextAtCursor } from "../editor/text-utils.js";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";
import EditorFullPreview from "../components/editor/EditorFullPreview.jsx";
import PostSubmissionWizard from "../components/editor/PostSubmissionWizard.jsx";
import { pushToast } from "../ui/toast.js";

function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  );
}

export default function EditorPage() {
  const { t, domainAssetsConfig, lastTabRoute } = useApp();
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
  const [showFullPreview, setShowFullPreview] = createSignal(false);
  const [showPublishWizard, setShowPublishWizard] = createSignal(false);
  const [isFullScreen, setIsFullScreen] = createSignal(false);

  let autoSaveTimeoutId;
  onCleanup(() => clearTimeout(autoSaveTimeoutId));

  const editorMode = createMemo(() => {
    const path = route();
    if (path.startsWith("/editor/new")) return "new_post";
    if (path.startsWith("/editor/edit/")) return "edit_post";
    if (path.startsWith("/editor/comment/")) return "comment";
    return "unknown";
  });
  
  const baseDir = createMemo(() => {
    return editorMode() === "new_post" ? DRAFT_DIRS.NEW_POST : DRAFT_DIRS.EDIT;
  });

  const domainLangCodes = createMemo(() => {
    const fromDomain = (domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    return fromDomain.length > 0 ? fromDomain : ["en"];
  });

  onMount(async () => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'f':
            e.preventDefault();
            setShowFiles(prev => !prev);
            break;
          case 'p':
            e.preventDefault();
            setShowPreview(prev => !prev);
            break;
          case 'm':
            e.preventDefault();
            setIsFullScreen(prev => !prev);
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));

    try {
      if (editorMode() === "new_post") {
        const draft = await loadDraft(baseDir());
        if (draft && draft.content) {
            setPostData(draft.content);
            const params = draft.params || {};
            if (!params.guid) {
                params.guid = crypto.randomUUID();
            }
            setPostParams(params);
        } else {
            const newPostData = {};
            const newPostParams = { locales: {}, guid: crypto.randomUUID() };
            for (const langCode of domainLangCodes()) {
                newPostData[langCode] = { title: "", body: "", chapters: [] };
                newPostParams.locales[langCode] = { chapters: [] };
            }
            setPostData(newPostData);
            setPostParams(newPostParams);
        }
      } else {
        // TODO: Logic for loading existing posts will go here
        setPostData({ en: { title: "", body: "", chapters: [] } });
        setPostParams({});
      }
    } catch (error) {
      dbg.error("EditorPage", "Failed to load draft, starting fresh.", error);
      setPostData({ en: { title: "", body: "", chapters: [] } });
      setPostParams({ guid: crypto.randomUUID() });
    }
  });

  createEffect(on([postData, postParams], ([data, params]) => {
    if (data === null || editorMode() !== "new_post") return;
    clearTimeout(autoSaveTimeoutId);
    autoSaveTimeoutId = setTimeout(() => {
      saveDraft(baseDir(), { content: data, params: params });
    }, 500);
  }, { defer: true }));

  createEffect(async () => {
    const thumbPath = postParams()?.thumbnail;
    if (thumbPath) {
      const url = await resolveDraftFileUrl(baseDir(), thumbPath);
      setThumbnailUrl(url);
    } else {
      setThumbnailUrl(null);
    }
  });

  createEffect(on(activeLang, (lang) => {
    if (!postData()?.[lang]) {
        setPostData(p => ({...p, [lang]: { title: "", body: "", chapters: [] }}));
        setPostParams(p => {
            const locales = {...(p.locales || {})};
            if (!locales[lang]) locales[lang] = { chapters: [] };
            return {...p, locales};
        });
    }
    const chapters = postData()?.[lang]?.chapters || [];
    setShowChapters(chapters.length > 0);
    setEditingChapterIndex(-1);
  }));

  const handlePublishSuccess = () => {
    pushToast({ type: "success", message: t("editor.publish.success") });
    setShowPublishWizard(false);
    // Draft clearing will be handled later based on a WebSocket event.
    navigate(lastTabRoute() || "/");
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

  const updateParam = (field, value) => {
    setPostParams(prev => ({ ...prev, [field]: value }));
  };

  const updateChapterTitle = (index, newTitle) => {
    setPostParams(prev => {
      const lang = activeLang();
      const locales = { ...(prev.locales || {}) };
      const langParams = locales[lang] || { chapters: [] };
      const chapters = [...(langParams.chapters || [])];
      if (index >= 0 && index < chapters.length) {
        chapters[index] = { ...chapters[index], title: newTitle };
      }
      locales[lang] = { ...langParams, chapters };
      return { ...prev, locales };
    });
  };

  const handleAddChapter = () => {
    const newChapterContent = { body: "" };
    const newChapterParams = { title: t("editor.chapters.newChapterTitle") || "New Chapter" };
    const newIndex = (postData()[activeLang()]?.chapters || []).length;

    batch(() => {
      setPostData(prev => {
        const lang = activeLang();
        const langData = prev[lang] || { title: "", body: "", chapters: [] };
        const chapters = [...(langData.chapters || []), newChapterContent];
        return { ...prev, [lang]: { ...langData, chapters } };
      });

      setPostParams(prev => {
        const lang = activeLang();
        const locales = { ...(prev.locales || {}) };
        const langParams = locales[lang] || { chapters: [] };
        const chapters = [...(langParams.chapters || []), newChapterParams];
        locales[lang] = { ...langParams, chapters };
        return { ...prev, locales };
      });
    });
    setEditingChapterIndex(newIndex);
  };

  const handleRemoveChapter = () => {
    if (editingChapterIndex() === -1) return;
    setShowConfirmDelete(true);
  };
  
  const confirmRemoveChapter = () => {
    const indexToRemove = editingChapterIndex();
    
    batch(() => {
      setPostData(prev => {
        const lang = activeLang();
        const chapters = (prev[lang]?.chapters || []).filter((_, i) => i !== indexToRemove);
        return { ...prev, [lang]: { ...prev[lang], chapters } };
      });

      setPostParams(prev => {
        const lang = activeLang();
        const newLocales = { ...(prev.locales || {}) };
        if (newLocales[lang]?.chapters) {
          const chapters = (newLocales[lang].chapters || []).filter((_, i) => i !== indexToRemove);
          newLocales[lang] = { ...newLocales[lang], chapters };
        }
        return { ...prev, locales: newLocales };
      });
    });

    setEditingChapterIndex(indexToRemove >= 1 ? indexToRemove - 1 : -1);
    if (postData()[activeLang()]?.chapters.length === 0) {
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

  const handleDeleteThumbnail = () => {
    setPostParams(prev => {
      const { thumbnail, ...rest } = prev;
      return rest;
    });
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
    return [rehypeResolveDraftUrls(baseDir())];
  });

  const combinedChapters = createMemo(() => {
    const contentChapters = currentLangData().chapters || [];
    const paramChapters = postParams()?.locales?.[activeLang()]?.chapters || [];
    return contentChapters.map((c, i) => ({
      ...c,
      title: paramChapters?.[i]?.title || ""
    }));
  });

  const filledLangs = createMemo(() => {
    const data = postData();
    if (!data) return [];
    return domainLangCodes().filter(langCode => {
        const langData = data[langCode];
        return langData && langData.title?.trim() && langData.body?.trim();
    });
  });

  return (
    <main classList={{
      "p-4 max-w-7xl mx-auto space-y-4": !isFullScreen(),
      "h-[calc(100vh-3rem)] flex flex-col": isFullScreen()
    }}>
      <Show
        when={!showFullPreview()}
        fallback={
          <EditorFullPreview 
            postData={postData()}
            postParams={postParams()}
            activeLang={activeLang()}
            thumbnailUrl={thumbnailUrl()}
            chapters={combinedChapters()}
            filledLangs={filledLangs()}
            onBack={() => setShowFullPreview(false)}
            onContinue={() => {
              setShowFullPreview(false);
              setShowPublishWizard(true);
            }}
          />
        }
      >
        <>
          <Show when={!isFullScreen()}>
            <ClosePageButton />
            <header class="flex justify-between items-start gap-4">
              <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-semibold">{title()}</h2>
                <p class="text-sm text-[hsl(var(--muted-foreground))]">
                  Mode: <strong>{editorMode()}</strong>
                </p>
              </div>
              <div class="w-48 flex-shrink-0 space-y-2">
                <div class="relative group aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden">
                  <Show when={thumbnailUrl()}
                    fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.thumbnailPlaceholder")}</span>}
                  >
                    <img src={thumbnailUrl()} alt="Thumbnail preview" class="w-full h-full object-cover" />
                    <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={handleDeleteThumbnail}
                        title={t("editor.thumbnail.delete")}
                        class="p-2 rounded-full bg-black/70 text-white hover:bg-red-600"
                      >
                        <TrashIcon class="w-5 h-5" />
                      </button>
                    </div>
                  </Show>
                </div>
                <div class="flex justify-center">
                  <LangSelector
                      codes={domainLangCodes()}
                      value={activeLang()}
                      onChange={setActiveLang}
                  />
                </div>
              </div>
            </header>
          </Show>

          <Show when={postData() !== null} fallback={<div>{t("common.loading")}</div>}>
            <div classList={{ "h-full flex flex-col": isFullScreen() }}>
              <Show when={!isFullScreen()}>
                <>
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
                </>
              </Show>
              
              <EditorToolbar
                isPreview={showPreview()}
                onTogglePreview={() => setShowPreview(!showPreview())}
                getTextareaRef={() => textareaRef}
                onValueChange={handleEditorInput}
                isFullScreen={isFullScreen()}
                onToggleFullScreen={() => setIsFullScreen(p => !p)}
              />
              <MarkdownInput
                editorRef={(el) => (textareaRef = el)}
                value={currentEditorContent()}
                onInput={handleEditorInput}
                placeholder={t("editor.bodyPlaceholder")}
                showPreview={showPreview()}
                rehypePlugins={markdownPlugins()}
                isFullScreen={isFullScreen()}
              />

              <Show when={!isFullScreen()}>
                <>
                  <div class="mt-6 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-4">
                    <h3 class="text-lg font-semibold">{t("editor.params.title")}</h3>
                    <div class="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-4">
                      <div class="justify-self-start self-start">
                        <label for="nsfw-checkbox" class="font-medium">{t("editor.params.nsfw.label")}</label>
                        <p class="text-xs text-[hsl(var(--muted-foreground))]">
                          {t("editor.params.nsfw.help")}
                        </p>
                      </div>
                      <div class="justify-self-start">
                        <input
                          id="nsfw-checkbox"
                          type="checkbox"
                          class="h-5 w-5"
                          checked={postParams().nsfw || false}
                          onInput={(e) => updateParam('nsfw', e.currentTarget.checked)}
                        />
                      </div>

                      <label class="font-medium" for="fundraiser-id">{t("editor.params.fundraiser.label")}</label>
                      <div class="justify-self-start">
                        <input
                          id="fundraiser-id"
                          type="number"
                          value={postParams().fundraiser || 0}
                          onInput={(e) => updateParam('fundraiser', parseInt(e.currentTarget.value, 10) || 0)}
                          class="w-24 text-left px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                          min="0"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="mt-6 flex justify-end">
                    <button 
                      onClick={() => setShowFullPreview(true)}
                      class="px-6 py-3 text-lg rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold hover:opacity-90"
                    >
                      {t("editor.previewPost")}
                    </button>
                  </div>
                </>
              </Show>
            </div>
          </Show>
        </>
      </Show>

      <EditorFilesDrawer 
        isOpen={showFiles()}
        onClose={() => setShowFiles(false)}
        baseDir={baseDir()}
        onInsert={handleInsertFile}
        onSetThumbnail={handleSetThumbnail}
        onInsertUrl={handleInsertUrl}
      />
      <ConfirmModal
        isOpen={showConfirmDelete()}
        onClose={() => setFileToDelete(null)}
        onConfirm={confirmRemoveChapter}
        title={t("editor.chapters.confirmDeleteTitle")}
        message={t("editor.chapters.confirmDeleteMessage")}
      />
      <PostSubmissionWizard 
        isOpen={showPublishWizard()}
        onClose={() => setShowPublishWizard(false)}
        onSuccess={handlePublishSuccess}
        postData={postData}
        postParams={postParams}
      />
    </main>
  );
}