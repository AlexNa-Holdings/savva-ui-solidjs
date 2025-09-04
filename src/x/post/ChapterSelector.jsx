// src/x/post/ChapterSelector.jsx
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function TocIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function ChapterSelector(props) {
  const { t } = useApp();
  const [isOpen, setIsOpen] = createSignal(false);
  let containerRef; 

  const chapters = () => props.chapters || [];
  const selectedIndex = () => props.selectedIndex;

  const selectedChapter = () => {
    const idx = selectedIndex();
    const list = chapters();
    return idx >= 0 && idx < list.length ? list[idx] : null;
  };
  
  const displayedTitle = () => {
    const chapter = selectedChapter();
    if (!chapter) return "";
    const idx = selectedIndex();
    return idx > 0 ? `${idx}. ${chapter.title}` : chapter.title;
  };

  const handleClickOutside = (event) => {
    if (containerRef && !containerRef.contains(event.target)) {
      setIsOpen(false);
    }
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  return (
    <div class="relative" ref={containerRef}>
      <button
        class="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[hsl(var(--accent))]"
        onClick={() => setIsOpen(!isOpen())}
        aria-haspopup="true"
        aria-expanded={isOpen()}
        title={t("post.chapters.title")}
      >
        <Show when={selectedChapter()?.title} fallback={<span>{t("post.chapters.title")}</span>}>
          <span class="font-semibold text-sm">{displayedTitle()}</span>
        </Show>
        <TocIcon class="w-5 h-5" />
      </button>

      <Show when={isOpen()}>
        <div class="absolute top-full right-0 mt-2 w-64 max-h-[22rem] overflow-y-auto rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black ring-opacity-5 z-20">
          <ul class="py-1" role="menu">
            <For each={chapters()}>
              {(chapter, i) => (
                <li>
                  <a
                    href="#"
                    class={`block w-full text-left px-4 py-2 text-sm truncate ${selectedIndex() === i() ? 'bg-[hsl(var(--accent))]' : 'hover:bg-[hsl(var(--accent))]'}`}
                    onClick={(e) => {
                      e.preventDefault();
                      props.onSelect?.(i());
                      setIsOpen(false);
                    }}
                    title={chapter.title}
                  >
                    {i() > 0 ? `${i()}. ${chapter.title}` : chapter.title}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}