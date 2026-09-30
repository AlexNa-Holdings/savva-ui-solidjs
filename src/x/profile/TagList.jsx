// src/x/profile/TagList.jsx
import { For, Show } from "solid-js";
import Spinner from "../ui/Spinner.jsx";

export default function TagList(props) {
  const tags = () => props.tags || [];
  const selectedTags = () => props.selectedTags || [];

  const isSelected = (tag) => selectedTags().includes(tag);

  return (
    <div class="flex flex-wrap gap-2 md:flex-col md:flex-nowrap md:max-h-[50vh] md:overflow-y-auto">
      <Show when={!props.loading} fallback={<Spinner class="w-5 h-5" />}>
        <For each={tags()}>
          {(tag) => (
            <button
              type="button"
              onClick={() => props.onTagToggle?.(tag)}
              class="md:w-full text-left px-3 py-1 text-sm rounded-md border truncate"
              classList={{
                "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]": isSelected(tag),
                "bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]": !isSelected(tag)
              }}
              aria-pressed={isSelected(tag) ? "true" : "false"}
              title={tag}
            >
              {tag}
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}
