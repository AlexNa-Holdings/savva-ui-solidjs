// src/x/editor/ChapterManager.jsx
import { For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

export default function ChapterManager(props) {
  const { t } = useApp();

  const handleAddChapter = () => {
    const newChapter = { title: t("editor.chapters.newChapterTitle"), body: "" };
    props.onUpdate([...(props.chapters || []), newChapter]);
  };

  const handleRemoveChapter = (index) => {
    const updatedChapters = (props.chapters || []).filter((_, i) => i !== index);
    props.onUpdate(updatedChapters);
    // If the active chapter was deleted, switch to prologue
    if (props.activeIndex === index) {
      props.onSelectIndex(-1);
    }
  };

  const handleTitleChange = (index, newTitle) => {
    const updatedChapters = (props.chapters || []).map((chapter, i) => 
      i === index ? { ...chapter, title: newTitle } : chapter
    );
    props.onUpdate(updatedChapters);
  };

  const activeClass = (index) => props.activeIndex === index ? "bg-[hsl(var(--accent))]" : "hover:bg-[hsl(var(--accent))]";

  return (
    <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] space-y-3">
      <h3 class="text-lg font-semibold">{t("editor.chapters.title")}</h3>
      <div class="space-y-2">
        {/* Prologue Item */}
        <div class={`flex items-center gap-2 p-1 rounded ${activeClass(-1)}`}>
          <button class="flex-1 text-left text-sm font-semibold" onClick={() => props.onSelectIndex(-1)}>
            {t("post.chapters.prologue")}
          </button>
        </div>

        {/* Chapter Items */}
        <For each={props.chapters}>
          {(chapter, index) => (
            <div class={`flex items-center gap-2 p-1 rounded ${activeClass(index())}`}>
              <button class="text-left text-sm font-semibold" onClick={() => props.onSelectIndex(index())}>
                {index() + 1}.
              </button>
              <input
                type="text"
                value={chapter.title}
                onInput={(e) => handleTitleChange(index(), e.currentTarget.value)}
                class="flex-1 px-2 py-1 text-sm rounded border bg-[hsl(var(--background))] border-[hsl(var(--input))]"
              />
              <button
                onClick={() => handleRemoveChapter(index())}
                class="p-1 text-xs text-[hsl(var(--destructive))]"
              >
                {t("common.remove")}
              </button>
            </div>
          )}
        </For>
      </div>
      <button
        onClick={handleAddChapter}
        class="text-sm px-3 py-1 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center gap-1"
      >
        <PlusIcon class="w-4 h-4" />
        {t("editor.chapters.add")}
      </button>
    </div>
  );
}
