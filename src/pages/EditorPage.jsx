// src/pages/EditorPage.jsx
import { createMemo, createSignal, Show } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import { useHashRouter } from "../routing/hashRouter.js";
import MarkdownInput from "../components/editor/MarkdownInput.jsx";
import LangSelector from "../components/ui/LangSelector.jsx";
import EditorToolbar from "../components/editor/EditorToolbar.jsx";
import EditorFilesDrawer from "../components/editor/EditorFilesDrawer.jsx";
import { rehypeRewriteLinks } from "../components/docs/rehype-rewrite-links.js";
import EditorFilesButton from "../components/editor/EditorFilesButton.jsx";

export default function EditorPage() {
  const { t, domainAssetsConfig } = useApp();
  const { route } = useHashRouter();
  let textareaRef;

  const [postData, setPostData] = createSignal({
    en: { title: "", body: "" },
  });
  const [activeLang, setActiveLang] = createSignal("en");
  const [showPreview, setShowPreview] = createSignal(false);
  const [showFiles, setShowFiles] = createSignal(false);

  const domainLangCodes = () => {
    const fromDomain = (domainAssetsConfig?.()?.locales || []).map((l) => l.code).filter(Boolean);
    return fromDomain.length > 0 ? fromDomain : ["en"];
  };

  const currentLangData = () => postData()[activeLang()] || { title: "", body: "" };

  const updateField = (field, value) => {
    setPostData(prev => ({
      ...prev,
      [activeLang()]: {
        ...(prev[activeLang()] || {}),
        [field]: value
      }
    }));
  };

  const editorMode = createMemo(() => {
    const path = route();
    if (path.startsWith("/editor/new")) return "new_post";
    if (path.startsWith("/editor/edit/")) return "edit_post";
    if (path.startsWith("/editor/comment/")) return "comment";
    return "unknown";
  });

  const title = createMemo(() => {
    switch (editorMode()) {
      case "new_post":
        return t("editor.titleNewPost");
      case "edit_post":
        return t("editor.titleEditPost");
      case "comment":
        return t("editor.titleComment");
      default:
        return t("editor.title");
    }
  });

  const ipfsBaseUrl = createMemo(() => {
    // This will be populated with the post's data_cid when editing an existing post.
    // For new posts, it remains empty, so relative links won't be rewritten yet.
    return ""; 
  });

  const markdownPlugins = createMemo(() => [
    [rehypeRewriteLinks, { base: ipfsBaseUrl() }]
  ]);

  return (
    <main class="p-4 max-w-7xl mx-auto space-y-4">
      <ClosePageButton />

      {/* Editor Header */}
      <header class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <h2 class="text-2xl font-semibold">{title()}</h2>
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            Mode: <strong>{editorMode()}</strong>
          </p>
        </div>
        <div class="w-48 flex-shrink-0 space-y-2">
          <div class="aspect-video rounded bg-[hsl(var(--muted))] flex items-center justify-center">
            <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("editor.sidebar.thumbnailPlaceholder")}</span>
          </div>
          <LangSelector
            codes={domainLangCodes()}
            value={activeLang()}
            onChange={setActiveLang}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <input
            type="text"
            value={currentLangData().title}
            onInput={(e) => updateField('title', e.currentTarget.value)}
            placeholder={t("editor.titlePlaceholder")}
            class="flex-1 w-full text-2xl font-bold px-2 py-1 bg-transparent border-b border-[hsl(var(--border))] focus:outline-none focus:border-[hsl(var(--primary))]"
          />
          <Show when={!showFiles()}>
            <div class="flex-shrink-0">
              <EditorFilesButton onClick={() => setShowFiles(true)} />
            </div>
          </Show>
        </div>
        <EditorToolbar
          isPreview={showPreview()}
          onTogglePreview={() => setShowPreview(!showPreview())}
          getTextareaRef={() => textareaRef}
          onValueChange={(newValue) => updateField('body', newValue)}
        />
        <MarkdownInput
          editorRef={(el) => (textareaRef = el)}
          value={currentLangData().body}
          onInput={(value) => updateField('body', value)}
          placeholder={t("editor.bodyPlaceholder")}
          showPreview={showPreview()}
          rehypePlugins={markdownPlugins()}
        />
      </div>

      <EditorFilesDrawer 
        isOpen={showFiles()}
        onClose={() => setShowFiles(false)}
      />
    </main>
  );
}