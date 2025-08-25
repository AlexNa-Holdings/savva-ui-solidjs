// src/components/ui/ContextMenu.jsx
import { createSignal, onMount, onCleanup, Show, For } from "solid-js";

function MoreIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="currentColor">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

export default function ContextMenu(props) {
  const [isOpen, setIsOpen] = createSignal(false);
  let containerRef;

  const handleClickOutside = (event) => {
    if (containerRef && !containerRef.contains(event.target)) {
      setIsOpen(false);
    }
  };

  onMount(() => document.addEventListener("mousedown", handleClickOutside));
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));

  const handleItemClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    item.onClick?.();
    setIsOpen(false);
  };

  return (
    <div class="absolute -bottom-2 -right-2 z-20" ref={containerRef}>
      <button
        class="p-1 rounded-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen());
        }}
        aria-haspopup="true"
        aria-expanded={isOpen()}
      >
        <MoreIcon />
      </button>

      <Show when={isOpen()}>
        <div class="absolute bottom-full right-0 mb-2 w-48 rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black ring-opacity-5">
          <ul class="py-1" role="menu">
            <For each={props.items}>
              {(item) => (
                <li>
                  <a
                    href="#"
                    class="block w-full text-left px-4 py-2 text-sm hover:bg-[hsl(var(--accent))]"
                    onClick={(e) => handleItemClick(e, item)}
                  >
                    {item.label}
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