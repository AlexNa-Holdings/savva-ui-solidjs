// src/components/editor/EditorFullPreview.jsx
import { createMemo, Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";
import UserCard from "../ui/UserCard.jsx";
import PostTags from "../post/PostTags.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import { rehypeResolveDraftUrls } from "../docs/rehype-resolve-draft-urls.js";
import ChapterSelector from "../post/ChapterSelector.jsx";
import ChapterPager from "../post/ChapterPager.jsx";

export default function EditorFullPreview(props) {
  const app = useApp();
  const { t } = app;
  const [selectedChapterIndex, setSelectedChapterIndex] = createSignal(0);

  const author = () => app.authorizedUser();
  const lang = () => props.activeLang;

  const title = createMemo(() => props.postData?.[lang()]?.title || "");

  const chapterList = createMemo(() => {
    const prologue = { title: t("post.chapters.prologue") };
    return [prologue, ...(props.chapters || [])];
  });

  const currentContent = createMemo(() => {
    const data = props.postData?.[lang()];
    if (!data) return "";
    const index = selectedChapterIndex();
    if (index === 0) {
      return data.body || "";
    }
    return data.chapters?.[index - 1]?.body || "";
  });

  const postForTags = createMemo(() => ({
    savva_content: {
      locales: {
        [lang()]: {
          categories: props.postParams?.locales?.[lang()]?.categories || [],
          tags: props.postParams?.locales?.[lang()]?.tags || [],
        }
      }
    }
  }));

  const markdownPlugins = createMemo(() => [rehypeResolveDraftUrls]);

  return (
    <div class="max-w-5xl mx-auto space-y-4">
      {/* Condensed Header */}
      <div class="p-3 rounded-lg flex items-center justify-between" style={{ background: "var(--gradient)" }}>
        <button onClick={props.onBack} class="px-4 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90">
          {t("editor.fullPreview.back")}
        </button>
        <div class="text-center text-[hsl(var(--card))]">
          <h2 class="font-bold">{t("editor.fullPreview.title")}</h2>
          <p class="text-xs opacity-90">{t("editor.fullPreview.help")}</p>
        </div>
        <button class="px-4 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-semibold hover:opacity-90">
          {t("editor.fullPreview.continue")}
        </button>
      </div>

      {/* Main Content with PostPage background */}
      <div class="bg-[hsl(var(--background))] p-4 rounded-lg border border-[hsl(var(--border))]">
        <article class="space-y-4">
          <header class="flex justify-between items-start gap-4">
            <div class="flex-1 min-w-0 space-y-3">
              <h1 class="text-2xl lg:text-3xl font-bold break-words">{title()}</h1>
              <UserCard author={author()} />
              <PostTags postData={postForTags()} />
            </div>
            <div class="w-48 flex-shrink-0">
              <Show when={props.thumbnailUrl}>
                <img src={props.thumbnailUrl} alt="Thumbnail preview" class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]" />
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