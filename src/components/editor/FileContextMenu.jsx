// src/components/editor/FileContextMenu.jsx
import { onMount, onCleanup, For } from "solid-js";

export default function FileContextMenu(props) {
  let menuRef;

  const handleClickOutside = (event) => {
    if (menuRef && !menuRef.contains(event.target)) {
      props.onClose?.();
    }
  };

  onMount(() => {
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  const handleItemClick = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    item.onClick?.();
    props.onClose?.();
  };

  return (
    <div
      ref={menuRef}
      class="absolute w-48 rounded-md shadow-lg bg-[hsl(var(--popover))] text-[hsl(var(--popover-foreground))] ring-1 ring-black ring-opacity-5 z-30"
      // This style attribute applies the dynamic position
      style={{ top: `${props.y}px`, left: `${props.x}px` }}
    >
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
  );
}