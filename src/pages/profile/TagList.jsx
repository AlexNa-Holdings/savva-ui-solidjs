// src/pages/profile/TagList.jsx
import { For, Show } from "solid-js";
import Spinner from "../../components/ui/Spinner.jsx";

export default function TagList(props) {
  const tags = () => props.tags || [];
  const selectedTags = () => props.selectedTags || [];

  const isSelected = (tag) => selectedTags().includes(tag);

  return (
    <div class="space-y-2">
      <Show when={!props.loading} fallback={<Spinner class="w-5 h-5" />}>
        <For each={tags()}>
          {(tag) => (
            <button
              onClick={() => props.onTagToggle?.(tag)}
              class="w-full text-left px-3 py-1.5 text-sm rounded-md border truncate"
              classList={{
                "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]": isSelected(tag),
                "bg-transparent border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]": !isSelected(tag)
              }}
            >
              #{tag}
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}