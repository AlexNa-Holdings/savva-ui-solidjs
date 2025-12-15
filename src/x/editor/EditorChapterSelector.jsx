// src/x/editor/EditorChapterSelector.jsx
import { createSignal, onMount, onCleanup, Show, For, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 16 16" class={props.class || "w-4 h-4"} aria-hidden="true" fill="currentColor">
      <path d="M8 11.25a.75.75 0 01-.53-.22l-4-4a.75.75 0 111.06-1.06L8 9.94l3.47-3.47a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-.53.22z"></path>
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function MinusIcon(props) {
    return (
      <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    );
}

export default function EditorChapterSelector(props) {
  const app = useApp();
  const { t } = app;
  const [isOpen, setIsOpen] = createSignal(false);
  let containerRef;

  const chapters = () => props.chapters || [];
  const activeIndex = () => props.activeIndex;

  // Use locale-specific translation for "Prologue" based on current editor locale
  const prologueLabel = createMemo(() => {
    const locale = props.locale?.() || props.locale;
    if (locale && app.tLang) {
      return app.tLang(locale, "post.chapters.prologue");
    }
    return t("post.chapters.prologue");
  });

  const activeItem = createMemo(() => {
    const index = activeIndex();
    if (index === -1) return { title: prologueLabel() };
    return chapters()[index] || null;
  });

  const displayedTitle = createMemo(() => {
    const item = activeItem();
    if (!item) return "";
    const index = activeIndex();
    return index > -1 ? `${index + 1}. ${item.title}` : item.title;
  });

  const handleClickOutside = (event) => {
    if (containerRef && !containerRef.contains(event.target)) {
      setIsOpen(false);
    }
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  return (
    <div class="space-y-2">
        <div class="flex items-center gap-2">
            <div class="relative w-full" ref={containerRef}>
                <button
                    class="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))]"
                    onClick={() => setIsOpen(!isOpen())}
                    aria-haspopup="true"
                    aria-expanded={isOpen()}
                >
                    <span class="font-semibold truncate">{displayedTitle()}</span>
                    <ChevronDownIcon />
                </button>

                <Show when={isOpen()}>
                    <div class="absolute top-full left-0 mt-1 w-full max-h-60 overflow-y-auto rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black ring-opacity-5 z-20">
                    <ul class="py-1" role="menu">
                        <li>
                            <a href="#" class="block w-full text-left px-4 py-2 text-sm hover:bg-[hsl(var(--accent))]" onClick={(e) => { e.preventDefault(); props.onSelectIndex(-1); setIsOpen(false); }}>
                                {prologueLabel()}
                            </a>
                        </li>
                        <For each={chapters()}>
                        {(chapter, i) => (
                            <li>
                                <a href="#" class="block w-full text-left px-4 py-2 text-sm hover:bg-[hsl(var(--accent))]" onClick={(e) => { e.preventDefault(); props.onSelectIndex(i()); setIsOpen(false); }}>
                                    {i() + 1}. {chapter.title}
                                </a>
                            </li>
                        )}
                        </For>
                    </ul>
                    </div>
                </Show>
            </div>
            <button onClick={props.onAdd} title={t("editor.chapters.add")} class="p-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
                <PlusIcon />
            </button>
            <button onClick={props.onRemove} title={t("editor.chapters.remove")} disabled={activeIndex() === -1} class="p-2 rounded-md bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] disabled:opacity-50">
                <MinusIcon />
            </button>
        </div>
        <Show when={activeIndex() > -1}>
            <input
                type="text"
                value={activeItem()?.title || ""}
                onInput={(e) => props.onTitleChange(e.currentTarget.value)}
                placeholder={t("editor.chapters.titlePlaceholder")}
                class="w-full text-sm px-2 py-1 bg-transparent border-b border-[hsl(var(--border))] focus:outline-none focus:border-[hsl(var(--primary))]"
            />
        </Show>
    </div>
  );
}