// src/x/feed/PostListView.jsx
import { For, createMemo } from "solid-js";
import PostCard from "./PostCard.jsx";

export default function PostListView(props) {
  const mode = () => (props.mode === "grid" ? "grid" : "list");

  const gridClass = createMemo(() => {
    const base = "grid gap-3 grid-cols-1 sm:grid-cols-2";
    // If the right rail is NOT visible, we have more space. Use up to 4 columns.
    // If the right rail IS visible, we have less space. Use up to 3 columns.
    return props.isRailVisible
      ? `${base} lg:grid-cols-2 xl:grid-cols-3`
      : `${base} lg:grid-cols-3 xl:grid-cols-4`;
  });

  return (
    <div class={mode() === "grid" ? gridClass() : "flex flex-col gap-3"}>
      <For each={props.items}>
        {(item) => <PostCard item={item} mode={mode()} />}
      </For>
    </div>
  );
}