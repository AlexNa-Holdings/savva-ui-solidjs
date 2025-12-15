// src/x/editor/EditorFullPreview.jsx
import { createMemo, Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";
import UserCard from "../ui/UserCard.jsx";
import PostTags from "../post/PostTags.jsx";
import { rehypeResolveDraftUrls } from "../../docs/rehype-resolve-draft-urls.js";
import ChapterSelector from "../post/ChapterSelector.jsx";
import ChapterPager from "../post/ChapterPager.jsx";
import LangSelector from "../ui/LangSelector.jsx";

export default function EditorFullPreview(props) {
  const app = useApp();
  const { t, tLang } = app;

  const [selectedChapterIndex, setSelectedChapterIndex] = createSignal(0);
  const [previewLang, setPreviewLang] = createSignal(props.activeLang);

  // Show the current actor (me or selected NPO)
  const author = () => (app.actorProfile?.() || app.authorizedUser?.());
  const lang = () => previewLang();

  const title = createMemo(() => props.postData?.[lang()]?.title || "");

  const chapterList = createMemo(() => {
    const currentLang = lang();
    const prologueTitle = tLang ? tLang(currentLang, "post.chapters.prologue") : t("post.chapters.prologue");
    const chapterFallback = () => tLang ? tLang(currentLang, "post.chapters.chapter") : t("post.chapters.chapter");
    const prologue = { title: prologueTitle };
    // Get chapters from the current preview language, not from props.chapters (which is only the active editor lang)
    const langChapters = (props.postData?.[currentLang]?.chapters || []).map((ch, i) => ({
      ...ch,
      title: ch.title || `${chapterFallback(i)} ${i + 1}`
    }));
    return [prologue, ...langChapters];
  });

  const currentContent = createMemo(() => {
    const data = props.postData?.[lang()];
    if (!data) return "";
    const index = selectedChapterIndex();
    if (index === 0) return data.body || "";
    return data.chapters?.[index - 1]?.body || "";
  });

  const postForTags = createMemo(() => ({
    savva_content: {
      locales: {
        [lang()]: {
          categories: props.postParams?.locales?.[lang()]?.categories || [],
          tags: props.postParams?.locales?.[lang()]?.tags || [],
        },
      },
    },
  }));

  const markdownPlugins = createMemo(() => [[rehypeResolveDraftUrls, { baseDir: props.baseDir }]]);

  const handlePublishClick = () => (props.onContinue || props.onPublish)?.();

  return (
    <div class="max-w-5xl mx-auto space-y-4">
      <div class="p-3 pr-4 rounded-lg flex items-center justify-between" style={{ background: "var(--gradient)" }}>
        <button
          onClick={props.onBack}
          class="ml-5 px-4 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
        >
          {t("editor.fullPreview.back")}
        </button>
        <div class="text-center text-[hsl(var(--card))]">
          <h2 class="font-bold">{t("editor.fullPreview.title")}</h2>
          <p class="text-xs opacity-90">{t("editor.fullPreview.help")}</p>
        </div>
        <button
          onClick={handlePublishClick}
          class="px-4 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
        >
          {t("editor.fullPreview.publish")}
        </button>
      </div>

      <div class="bg-[hsl(var(--background))] p-4 rounded-lg border border-[hsl(var(--border))]">
        <article class="space-y-4">
          <header class="flex justify-between items-start gap-4">
            <div class="flex-1 min-w-0 space-y-3">
              <h1 class="text-2xl lg:text-3xl font-bold break-words">{title()}</h1>
              <UserCard author={author()} />
              <PostTags postData={postForTags()} />
            </div>
            <div class="w-48 flex-shrink-0 space-y-2">
              <Show when={props.thumbnailUrl}>
                <img
                  src={props.thumbnailUrl}
                  alt="Thumbnail preview"
                  class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]"
                />
              </Show>
              <Show when={(props.filledLangs || []).length > 1}>
                <div class="flex justify-center">
                  <LangSelector codes={props.filledLangs} value={previewLang()} onChange={setPreviewLang} />
                </div>
              </Show>
            </div>
          </header>

          <div class="pt-4 border-t border-[hsl(var(--border))]">
            <Show when={(chapterList()?.length || 0) > 1}>
              <div class="flex justify-end mb-4">
                <ChapterSelector
                  chapters={chapterList()}
                  selectedIndex={selectedChapterIndex()}
                  onSelect={setSelectedChapterIndex}
                />
              </div>
            </Show>

            <MarkdownView markdown={currentContent()} rehypePlugins={markdownPlugins()} />

            <Show when={(chapterList()?.length || 0) > 1}>
              <ChapterPager
                chapters={chapterList()}
                currentIndex={selectedChapterIndex()}
                onSelect={setSelectedChapterIndex}
              />
            </Show>
          </div>
        </article>
      </div>
    </div>
  );
}
