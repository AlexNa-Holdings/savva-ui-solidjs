// src/components/editor/MarkdownInput.jsx
import { Show } from "solid-js";
import MarkdownView from "../docs/MarkdownView.jsx";

export default function MarkdownInput(props) {
  return (
    <div class={`grid gap-4 h-[60vh] min-h-[400px] ${props.showPreview ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
      <textarea
        ref={props.editorRef}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        class="w-full h-full p-3 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        placeholder={props.placeholder}
      />
      <Show when={props.showPreview}>
        <div class="h-full overflow-y-auto p-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
          <MarkdownView markdown={props.value} />
        </div>
      </Show>
    </div>
  );
}
