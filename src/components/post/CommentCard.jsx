// src/components/post/CommentCard.jsx
import { For, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext";
import PostInfo from "../feed/PostInfo";
import UserCard from "../ui/UserCard";

/**
 * Recursively renders a comment and its children.
 */
export default function CommentCard(props) {
  const app = useApp(); // Correctly assign the app context to a variable
  const { t } = app;
  const comment = () => props.comment;
  const level = () => props.level || 0;

  const localizedPreview = createMemo(() => {
    const locales = comment().savva_content?.locales;
    if (!locales) return "";
    const lang = app.lang(); // Now this will work
    if (locales[lang]?.text_preview) return locales[lang].text_preview;
    if (locales.en?.text_preview) return locales.en.text_preview;
    const firstKey = Object.keys(locales)[0];
    return firstKey ? locales[firstKey].text_preview : "";
  });

  return (
    <div
      class="flex flex-col"
      style={{ "padding-left": level() > 0 ? "1.5rem" : "0" }}
    >
      <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div class="mb-2">
          <UserCard author={comment().author} compact={true} />
        </div>
        <p class="text-sm">{localizedPreview()}</p>
        <div class="mt-2 flex items-center justify-between">
          <PostInfo item={{ _raw: comment() }} hideTopBorder={true} />
          <button class="text-xs font-semibold hover:underline">Reply</button>
        </div>
      </div>
      
      <Show when={comment().children?.length > 0}>
        <div class="mt-3 space-y-3 border-l-2 border-[hsl(var(--border))]">
          <For each={comment().children}>
            {(reply) => <CommentCard comment={reply} level={level() + 1} />}
          </For>
        </div>
      </Show>
    </div>
  );
}