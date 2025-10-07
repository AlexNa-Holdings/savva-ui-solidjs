// src/pages/EditorPage.jsx
import { createMemo, createSignal, Show, onMount, createEffect, on, onCleanup, batch } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import { useHashRouter, navigate } from "../../routing/hashRouter.js";
import NavigateBack from "../../routing/navigateBack.js";
import MarkdownInput from "../editor/MarkdownInput.jsx";
import LangSelector from "../ui/LangSelector.jsx";
import EditorToolbar from "../editor/EditorToolbar.jsx";
import EditorFilesDrawer from "../editor/EditorFilesDrawer.jsx";
import { rehypeResolveDraftUrls } from "../../docs/rehype-resolve-draft-urls.js";
import EditorFilesButton from "../editor/EditorFilesButton.jsx";
import EditorActionsRow from "../editor/EditorActionsRow.jsx";
import AdditionalParametersPost from "../editor/AdditionalParametersPost.jsx";

import {
  loadDraft, saveDraft, resolveDraftFileUrl, DRAFT_DIRS, clearDraft,
  addUploadedFile, getAllUploadedFileNames, deleteUploadedFile
} from "../../editor/storage.js";
import { dbg } from "../../utils/debug.js";
import EditorChapterSelector from "../editor/EditorChapterSelector.jsx";
import EditorTocButton from "../editor/EditorTocButton.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { insertTextAtCursor } from "../../editor/text-utils.js";
import EditorFullPreview from "../editor/EditorFullPreview.jsx";
import PostSubmissionWizard from "../editor/PostSubmissionWizard.jsx";
import { pushToast } from "../../ui/toast.js";
import CommentEditor from "../editor/CommentEditor.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { TrashIcon } from "../ui/icons/ActionIcons.jsx";
import { createAIPostHandler } from "../../ai/AIPostHandler.js";
import ClaimableRewardHint from "../editor/ClaimableRewardHint.jsx";
import { preparePostForEditing } from "../../editor/postImporter.js";

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;

  await whenWsOpen();

  const contentList = app.wsMethod("content-list");
  const requestParams = { domain, lang, limit: 1 };
  if (identifier.startsWith("0x")) requestParams.savva_cid = identifier;
  else requestParams.short_cid = identifier;

  const user = app.authorizedUser();
  if (user?.address) requestParams.my_addr = toChecksumAddress(user.address);

  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  return arr[0] || null;
}

export default function EditorPage() {
  const app = useApp();
  const { t, domainAssetsConfig, lastTabRoute } = app;
  const { route } = useHashRouter();
  let textareaRef;

  const [postData, setPostData] = createSignal(null);
  const [postParams, setPostParams] = createSignal({});
  const [activeLang, setActiveLang] = createSignal(app.lang());
  const [showPreview, setShowPreview] = createSignal(false);
  const [showFiles, setShowFiles] = createSignal(false);
  const [showChapters, setShowChapters] = createSignal(false);
  const [editingChapterIndex, setEditingChapterIndex] = createSignal(-1);
  const [showConfirmDelete, setShowConfirmDelete] = createSignal(false);
  const [showConfirmClear, setShowConfirmClear] = createSignal(false);
  const [thumbnailUrl, setThumbnailUrl] = createSignal(null);
  const [showFullPreview, setShowFullPreview] = createSignal(false);
  const [showPublishWizard, setShowPublishWizard] = createSignal(false);
  const [isFullScreen, setIsFullScreen] = createSignal(false);
  const [filesRevision, setFilesRevision] = createSignal(0);

  const [parentPreviewCid, setParentPreviewCid] = createSignal(null);
  const [aiLastRunOk, setAiLastRunOk] = createSignal(false);

  let autoSaveTimeoutId;
  onCleanup(() => clearTimeout(autoSaveTimeoutId));

  // ----- routing / editor mode -----
  const routeParams = createMemo(() => {
    const path = route();
    if (path.startsWith("/editor/new-comment/")) return { mode: "new_comment", parent_savva_cid: path.split("/")[3] };
    if (path.startsWith("/editor/comment/")) return { mode: "edit_comment", id: path.split("/")[3] };
    if (path.startsWith("/editor/new")) return { mode: "new_post" };
    if (path.startsWith("/editor/edit/")) return { mode: "edit_post", id: path.split("/")[3] };
    return { mode: "unknown" };
  });
  const editorMode = () => routeParams().mode;

  // A stable draftKey for AI snapshots (depends on route)
  const draftKey = createMemo(() => {
    const domain = app.selectedDomainName?.() || "domain";
    const rp = routeParams();
    if (rp.mode === "edit_post") return `${domain}/post/${rp.id}`;
    if (rp.mode === "new_post") return `${domain}/post/new`;
    if (rp.mode === "new_comment") return `${domain}/comment/new/${rp.parent_savva_cid || "root"}`;
    if (rp.mode === "edit_comment") return `${domain}/comment/${rp.id}`;
    return `${domain}/editor`;
  });

  // ----- AI integration: read/apply/transform -----
  function readEditorState() {
    return {
      postData: postData(),
      postParams: postParams(),
      activeLang: activeLang(),
      editingChapterIndex: editingChapterIndex(),
    };
  }
  function applyEditorState(s) {
    if (!s) return;
    if (typeof s.postData !== "undefined") setPostData(s.postData);
    if (typeof s.postParams !== "undefined") setPostParams(s.postParams);
    if (typeof s.activeLang !== "undefined") setActiveLang(s.activeLang);
    if (typeof s.editingChapterIndex !== "undefined") setEditingChapterIndex(s.editingChapterIndex);
  }

  const baseDir = createMemo(() => {
    const mode = editorMode();
    if (mode === "new_post") return DRAFT_DIRS.NEW_POST;
    if (mode === "new_comment") return DRAFT_DIRS.NEW_COMMENT;
    if (["edit_post", "edit_comment"].includes(mode)) return DRAFT_DIRS.EDIT;
    return "unknown";
  });

  const domainLangCodes = createMemo(() => {
    const fromDomain = (domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    return fromDomain.length > 0 ? fromDomain : ["en"];
  });

  const ai = createAIPostHandler({
    draftKey: draftKey(),
    readState: readEditorState,
    applyState: applyEditorState,
    t,
    onToast: (evt) => {
      if (evt?.type === "error") setAiLastRunOk(false);
      if (evt?.type === "info" || evt?.type === "success") setAiLastRunOk(true);
      pushToast(evt);
    },
    supportedLangs: () => domainLangCodes(),
    editorMode: () => editorMode(),
  });

  createEffect(on(routeParams, (rp) => {
    if (!rp) return;
    const mode = rp.mode;
    if (mode === "new_comment") {
      setParentPreviewCid(rp.parent_savva_cid);
      return;
    }
    if (mode === "edit_comment") {
      setParentPreviewCid(null);
      (async () => {
        try {
          const current = await fetchPostByIdentifier({
            identifier: rp.id,
            domain: app.selectedDomainName(),
            app,
            lang: app.lang(),
          });
          setParentPreviewCid(current?.parent_savva_cid || null);
        } catch (e) {
          dbg.error("EditorPage", "Failed to resolve parent for edited comment", e);
          setParentPreviewCid(null);
        }
      })();
      return;
    }
    setParentPreviewCid(null);
  }));

  const loadEditorContent = async () => {
    try {
      const mode = editorMode();
      if (mode === "new_comment") {
        await clearDraft(baseDir());
        const parentCid = routeParams().parent_savva_cid;
        const parentObject = await fetchPostByIdentifier({
          identifier: parentCid,
          domain: app.selectedDomainName(),
          app,
          lang: app.lang(),
        });
        if (!parentObject) throw new Error("Parent content not found.");
        const isReplyToComment = !!parentObject.parent_savva_cid;
        const newPostParams = {
          locales: {},
          guid: crypto.randomUUID(),
          parent_savva_cid: parentObject.savva_cid,
          root_savva_cid: isReplyToComment ? (parentObject.root_savva_cid || parentObject.parent_savva_cid) : parentObject.savva_cid,
        };
        const newPostData = {};
        for (const langCode of domainLangCodes()) {
          newPostData[langCode] = { title: "", body: "", chapters: [] };
          newPostParams.locales[langCode] = { chapters: [] };
        }
        batch(() => {
          setPostData(newPostData);
          setPostParams(newPostParams);
        });
      } else {
        let draft = await loadDraft(baseDir());

        if (mode === "edit_post") {
          const targetCid = routeParams().id;
          const currentCid = draft?.params?.originalSavvaCid;
          if (!draft || (targetCid && currentCid && currentCid !== targetCid) || (targetCid && !currentCid)) {
            dbg.log("EditorPage", "Draft missing or mismatched for edit, re-importing post", {
              targetCid,
              currentCid,
              hasDraft: !!draft,
            });
            const postObject = await fetchPostByIdentifier({
              identifier: targetCid,
              domain: app.selectedDomainName(),
              app,
              lang: app.lang(),
            });
            if (!postObject) {
              throw new Error("Post not found for editing.");
            }
            await preparePostForEditing(postObject, app);
            draft = await loadDraft(baseDir());
            dbg.log("EditorPage", "Draft prepared via importer", {
              targetCid,
              hasDraftAfterImport: !!draft,
              locales: Object.keys(draft?.content || {}),
            });
          }
        }

        if (draft && draft.content) {
          const availableLangs = Object.keys(draft.content);
          const currentUiLang = app.lang();
          let initialLang = activeLang();
          if (availableLangs.length > 0 && !availableLangs.includes(currentUiLang)) {
            initialLang = availableLangs[0];
            dbg.log("EditorPage:load", `UI lang '${currentUiLang}' not in draft [${availableLangs.join(', ')}]. Falling back to '${initialLang}'.`);
          } else if (availableLangs.length > 0) {
            initialLang = currentUiLang;
            dbg.log("EditorPage:load", `UI lang '${currentUiLang}' is available in draft [${availableLangs.join(', ')}]. Sticking with it.`);
          } else {
            dbg.log("EditorPage:load", `Draft has no languages. This should not happen if draft.content exists.`);
          }
          const initialChapters = (draft.content?.[initialLang]?.chapters || []);
          batch(() => {
            setPostData(draft.content);
            const params = draft.params || {};
            if (editorMode() === "new_post" && !params.guid) {
              params.guid = crypto.randomUUID();
            }
            setPostParams(params);
            setActiveLang(initialLang);
            // Ensure chapters block is shown on initial load when chapters already exist
            setShowChapters(initialChapters.length > 0);
          });
        } else if (editorMode() === "new_post") {
          const newPostData = {};
          const newPostParams = { locales: {}, guid: crypto.randomUUID() };
          for (const langCode of domainLangCodes()) {
            newPostData[langCode] = { title: "", body: "", chapters: [] };
            newPostParams.locales[langCode] = { chapters: [] };
          }
          batch(() => {
            setPostData(newPostData);
            setPostParams(newPostParams);
            setShowChapters(false);
          });
        } else {
          dbg.error("EditorPage", `Draft not found for edit mode in '${baseDir()}', navigating back.`);
          navigate(lastTabRoute() || "/");
        }
      }
    } catch (error) {
      dbg.error("EditorPage", "Failed to load draft, navigating away.", error);
      navigate(lastTabRoute() || "/");
    }
  };

  const uiLang = createMemo(() => app.lang());

  createEffect(() => {
    const currentBaseDir = baseDir();
    const currentUiLang = uiLang();
    if (currentBaseDir && currentBaseDir !== "unknown" && currentUiLang) {
      loadEditorContent();
    }
  });

  onMount(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "f": e.preventDefault(); setShowFiles((p) => !p); break;
          case "p": e.preventDefault(); setShowPreview((p) => !p); break;
          case "m": e.preventDefault(); setIsFullScreen((p) => !p); break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  createEffect(
    on(
      [postData, postParams],
      ([data, params]) => {
        if (data === null) return;
        clearTimeout(autoSaveTimeoutId);
        autoSaveTimeoutId = setTimeout(() => {
          saveDraft(baseDir(), { content: data, params: params });
        }, 500);
      },
      { defer: true }
    )
  );

  createEffect(async () => {
    const thumbPath = postParams()?.thumbnail;
    setThumbnailUrl(thumbPath ? await resolveDraftFileUrl(baseDir(), thumbPath) : null);
  });

  const handleLangChange = (lang) => {
    if (!postData()?.[lang]) {
      batch(() => {
        setPostData((p) => ({ ...p, [lang]: { title: "", body: "", chapters: [] } }));
        setPostParams((p) => {
          const locales = { ...(p.locales || {}) };
          if (!locales[lang]) locales[lang] = { chapters: [] };
          return { ...p, locales };
        });
      });
    }
    setActiveLang(lang);
    setEditingChapterIndex(-1);
    setShowChapters((postData()?.[lang]?.chapters || []).length > 0);
  };

  createEffect(on(activeLang, (lang, prevLang) => {
    if (prevLang === undefined) return;
    const chapters = postData()?.[lang]?.chapters || [];
    setShowChapters(chapters.length > 0);
    setEditingChapterIndex(-1);
  }, { defer: true }));

  // Keep chapters block visibility in sync when draft data loads/changes
  createEffect(
    on([postData, activeLang], ([data, lang]) => {
      if (!data) return;
      const chapters = data?.[lang]?.chapters || [];
      setShowChapters(chapters.length > 0);
    }, { defer: true })
  );

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    let imagePasted = false;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        e.preventDefault();
        imagePasted = true;
        const file = item.getAsFile();
        const extension = file.type.split("/")[1] || "png";
        const fileName = `pasted-image-${Date.now()}.${extension}`;
        const newFile = new File([file], fileName, { type: file.type });
        try {
          await addUploadedFile(baseDir(), newFile);
          const markdownText = `![${fileName}](uploads/${fileName})`;
          insertTextAtCursor(textareaRef, markdownText, handleEditorInput);
        } catch (err) {
          dbg.error("EditorPage:Paste", "Failed to save pasted image", err);
        }
      }
    }
    if (imagePasted) setFilesRevision((r) => r + 1);
  };

  const handlePublishSuccess = () => {
    pushToast({ type: "success", message: t("editor.publish.success") });
    setShowPublishWizard(false);
    if (editorMode() === "new_post") {
      navigate("/new");
    } else if (editorMode() === "edit_post") {
      navigate("/post/" + postParams().savva_cid);
    } else {
      NavigateBack("post");
    }
  };

  const currentLangData = createMemo(() => postData()?.[activeLang()] || { title: "", body: "", chapters: [] });
  const updateField = (field, value) => {
    setPostData((prev) => ({
      ...prev,
      [activeLang()]: { ...(prev?.[activeLang()] || { chapters: [] }), [field]: value },
    }));
  };

  const handleConfirmClear = async () => {
    try {
      const names = await getAllUploadedFileNames(baseDir());
      for (const name of names) await deleteUploadedFile(baseDir(), name);
    } catch (e) { dbg.warn?.("EditorPage", "Failed to clear uploads", e); }
    const newPostData = {};
    const newPostParams = {
      guid: editorMode() === "new_post" ? crypto.randomUUID() : postParams().guid,
      publishAsNewPost: editorMode() === "edit_post" ? false : undefined,
      locales: {},
    };
    if (editorMode() === "new_comment") {
      newPostParams.parent_savva_cid = routeParams().parent_savva_cid;
    }
    for (const langCode of domainLangCodes()) {
      newPostData[langCode] = { title: "", body: "", chapters: [] };
      newPostParams.locales[langCode] = { chapters: [] };
    }
    batch(() => {
      setPostData(newPostData);
      setPostParams(newPostParams);
      setEditingChapterIndex(-1);
      setShowChapters(false);
      setThumbnailUrl(null);
      setFilesRevision((r) => r + 1);
    });
    pushToast({ type: "success", message: t("editor.publish.draftCleared") });
    setShowConfirmClear(false);
  };

  const updateChapterTitle = (index, newTitle) => {
    setPostParams((prev) => {
      const lang = activeLang();
      const locales = { ...(prev.locales || {}) };
      const langParams = locales[lang] || { chapters: [] };
      const chapters = [...(langParams.chapters || [])];
      if (index >= 0 && index < chapters.length) chapters[index] = { ...chapters[index], title: newTitle };
      locales[lang] = { ...langParams, chapters };
      return { ...prev, locales };
    });
  };

  const handleAddChapter = () => {
    const newChapterContent = { body: "" };
    const newChapterParams = { title: t("editor.chapters.newChapterTitle") || "New Chapter" };
    const newIndex = (postData()[activeLang()]?.chapters || []).length;
    batch(() => {
      setPostData((prev) => {
        const lang = activeLang();
        const langData = prev[lang] || { title: "", body: "", chapters: [] };
        const chapters = [...(langData.chapters || []), newChapterContent];
        return { ...prev, [lang]: { ...langData, chapters } };
      });
      setPostParams((prev) => {
        const lang = activeLang();
        const locales = { ...(prev.locales || {}) };
        const langParams = locales[lang] || { chapters: [] };
        const chapters = [...(langParams.chapters || []), newChapterParams];
        locales[lang] = { ...langParams, chapters };
        return { ...prev, locales };
      });
      setShowChapters(true);
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
      setPostData((prev) => {
        const lang = activeLang();
        const chapters = (prev[lang]?.chapters || []).filter((_, i) => i !== indexToRemove);
        return { ...prev, [lang]: { ...prev[lang], chapters } };
      });
      setPostParams((prev) => {
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
    if (postData()[activeLang()]?.chapters.length === 0) setShowChapters(false);
  };

  const currentEditorContent = createMemo(() => {
    const langData = currentLangData();
    const index = editingChapterIndex();
    return index === -1 ? langData.body : (langData.chapters?.[index]?.body || "");
  });

  const handleEditorInput = (value) => {
    const index = editingChapterIndex();
    if (index === -1) updateField("body", value);
    else {
      const lang = activeLang();
      const chapters = [...(postData()[lang]?.chapters || [])];
      chapters[index] = { ...chapters[index], body: value };
      updateField("chapters", chapters);
    }
  };

  const handleInsertFile = (fileName, fileType) => {
    const url = `uploads/${fileName}`;
    let markdown;
    if (fileType === "image" || fileType === "video") markdown = `![${fileName}](${url})`;
    else markdown = `[${fileName}](${url})`;
    insertTextAtCursor(textareaRef, markdown, handleEditorInput);
  };

  const handleSetThumbnail = (fileName) => {
    setPostParams((prev) => ({ ...prev, thumbnail: `uploads/${fileName}` }));
  };

  const handleDeleteThumbnail = () => {
    setPostParams((prev) => {
      const { thumbnail, ...rest } = prev;
      return rest;
    });
  };

  const handleInsertUrl = (fileName) => insertTextAtCursor(textareaRef, `uploads/${fileName}`, handleEditorInput);

  const title = createMemo(() => {
    switch (editorMode()) {
      case "new_post": return t("editor.titleNewPost");
      case "edit_post": return t("editor.titleEditPost");
      case "new_comment": return t("editor.titleNewCommentFor");
      case "edit_comment": return t("editor.titleEditComment");
      default: return t("editor.title");
    }
  });

  const markdownPlugins = createMemo(() => [[rehypeResolveDraftUrls, { baseDir: baseDir() }]]);
  const combinedChapters = createMemo(() => {
    const contentChapters = currentLangData().chapters || [];
    const paramChapters = postParams()?.locales?.[activeLang()]?.chapters || [];
    return contentChapters.map((c, i) => ({ ...c, title: paramChapters?.[i]?.title || "" }));
  });

  const filledLangs = createMemo(() => {
    const data = postData();
    if (!data) return [];
    return domainLangCodes().filter((langCode) => {
      const langData = data[langCode];
      return langData && (langData.title?.trim() || langData.body?.trim() || langData.chapters?.some((c) => c.body?.trim()));
    });
  });

  return (
    <main classList={{ "p-4 max-w-7xl mx-auto space-y-4": !isFullScreen(), "h-[calc(100vh-3rem)] flex flex-col": isFullScreen() }}>
      <Show
        when={!showFullPreview()}
        fallback={
          <EditorFullPreview
            postData={postData()} postParams={postParams()} activeLang={activeLang()}
            thumbnailUrl={thumbnailUrl()} chapters={combinedChapters()} filledLangs={filledLangs()}
            onBack={() => setShowFullPreview(false)}
            onContinue={() => { setShowFullPreview(false); setShowPublishWizard(true); }}
            baseDir={baseDir()}
          />
        }
      >
        <>
          <Show when={!isFullScreen()}>
            <ClosePageButton mode="close" />
            <header class="flex justify-between items-start gap-4">
              <div class="min-w-0">
                <h2 class="text-2xl font-semibold">{title()}</h2>
              </div>

              {/* Middle: takes the remaining space; centers the hint */}
              <div class="flex-1 flex items-center justify-center">
                <Show when={editorMode() === "new_post"}>
                  <ClaimableRewardHint />
                </Show>
              </div>
              <Show when={editorMode() === "new_post" || editorMode() === "edit_post"}>
                <div class="w-48 flex-shrink-0 space-y-2">
                  <div class="relative group aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden">
                    <Show
                      when={thumbnailUrl()}
                      fallback={<span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.thumbnailPlaceholder")}</span>}
                    >
                      <img src={thumbnailUrl()} alt="Thumbnail preview" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={handleDeleteThumbnail} title={t("editor.thumbnail.delete")} class="p-2 rounded-full bg-black/70 text-white hover:bg-red-600">
                          <TrashIcon class="w-5 h-5" />
                        </button>
                      </div>
                    </Show>
                  </div>
                  <div class="flex justify-center">
                    <LangSelector codes={domainLangCodes()} value={activeLang()} onChange={handleLangChange} />
                  </div>
                </div>
              </Show>
            </header>
          </Show>

          <Show when={postData() !== null} fallback={<div>{t("common.loading")}</div>}>
            <div classList={{ "h-full flex flex-col": isFullScreen() }}>
              <Show when={!isFullScreen()}>
                <>
                  <Show when={editorMode() === 'new_comment' || editorMode() === 'edit_comment'}>
                    <div class="mt-4">
                      <CommentEditor savva_cid={routeParams().parent_savva_cid || routeParams().id} resolveParentIfComment={editorMode() === 'edit_comment'} />
                      <div class="flex justify-end items-center gap-2 my-4">
                        <LangSelector codes={domainLangCodes()} value={activeLang()} onChange={handleLangChange} />
                        <EditorFilesButton onClick={() => setShowFiles(true)} />
                      </div>
                    </div>
                  </Show>

                  <Show when={editorMode() === "new_post" || editorMode() === "edit_post"}>
                    <div class="flex items-center gap-4 mb-4">
                      <input
                        type="text"
                        value={currentLangData().title}
                        onInput={(e) => updateField("title", e.currentTarget.value)}
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
                  </Show>

                  <Show when={showChapters() && editorMode() !== "new_comment" && editorMode() !== "edit_comment"}>
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
                onToggleFullScreen={() => setIsFullScreen((p) => !p)}
              />
              <MarkdownInput
                editorRef={(el) => (textareaRef = el)}
                value={currentEditorContent()}
                onInput={handleEditorInput}
                onPaste={handlePaste}
                placeholder={t("editor.bodyPlaceholder")}
                showPreview={showPreview()}
                rehypePlugins={markdownPlugins()}
                isFullScreen={isFullScreen()}
              />

              <Show when={!isFullScreen()}>
                <>
                  <AdditionalParametersPost
                    editorMode={editorMode}
                    postParams={postParams}
                    setPostParams={setPostParams}
                    activeLang={activeLang}
                  />
                  <div class="mt-6">
                    <EditorActionsRow
                      deleteButton={
                        <button
                          onClick={() => setShowConfirmClear(true)}
                          title={t("editor.clearDraft")}
                          class="p-2 rounded-md border border-[hsl(var(--destructive))] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))]"
                        >
                          <TrashIcon />
                        </button>
                      }
                      renderPreviewButton={({ withAiIcon, AiIconEl, disabled }) => (
                        <button
                          onClick={async () => {
                            if (withAiIcon) {          // ← auto mode + configured
                              if (ai.running()) return;
                              setAiLastRunOk(false);
                              await ai.run();          // toasts set aiLastRunOk(true/false)
                              if (aiLastRunOk()) {
                                setShowFullPreview(true);
                              }
                              return;                  // on failure, stay on the page
                            }
                            // manual flow
                            setShowFullPreview(true);
                          }}
                          disabled={!!disabled}
                          class="px-6 py-3 text-lg rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center"
                        >
                          {withAiIcon && <span class="mr-2">{AiIconEl}</span>}
                          {t("editor.previewPost")}
                        </button>
                      )}
                      aiPending={ai.pending()}
                      aiRunning={ai.running()}
                      aiProgress={ai.progress()}
                      onAiRun={ai.run}
                      onAiUndo={ai.undo}
                      onAiConfirm={ai.confirm}
                    />
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
        filesRevision={filesRevision()}
      />
      <ConfirmModal
        isOpen={showConfirmDelete()}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={confirmRemoveChapter}
        title={t("editor.chapters.confirmDeleteTitle")}
        message={t("editor.chapters.confirmDeleteMessage")}
      />
      <ConfirmModal
        isOpen={showConfirmClear()}
        onClose={() => setShowConfirmClear(false)}
        onConfirm={handleConfirmClear}
        title={t("editor.clearDraftTitle")}
        message={t("editor.clearDraftMessage")}
      />
      <PostSubmissionWizard
        isOpen={showPublishWizard()}
        onClose={() => setShowPublishWizard(false)}
        onSuccess={handlePublishSuccess}
        postData={postData}
        postParams={postParams}
        editorMode={editorMode()}
      />
    </main>
  );
}
