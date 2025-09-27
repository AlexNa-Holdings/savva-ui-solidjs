// src/x/editor/MarkdownInput.jsx
import { Show } from "solid-js";
import MarkdownView from "../docs/MarkdownView.jsx";

export default function MarkdownInput(props) {
  const containerClasses = () => {
    const layout = props.showPreview ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
    const size = props.isFullScreen ? "flex-1" : "h-[400px]";
    return `grid ${size} min-h-0 max-h-full w-full gap-3 ${layout}`;
  };

  return (
    <div class={containerClasses()}>
      <div class="flex flex-col min-h-0 max-h-full overflow-hidden">
        <textarea
          ref={props.editorRef}
          value={props.value}
          onInput={(e) => props.onInput(e.currentTarget.value)}
          onPaste={props.onPaste}
          class="flex-1 min-h-0 max-h-full w-full p-3 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:z-10"
          placeholder={props.placeholder}
        />
      </div>
      <Show when={props.showPreview}>
        <div class="flex flex-col min-h-0 max-h-full overflow-hidden">
          <div class="flex-1 min-h-0 max-h-full overflow-y-auto p-3 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <MarkdownView markdown={props.value} rehypePlugins={props.rehypePlugins} />
          </div>
        </div>
      </Show>
    </div>
  );
}
